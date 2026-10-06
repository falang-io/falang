// oxlint-disable max-lines, init-declarations, no-await-in-loop, no-inline-comments, no-undefined, no-useless-undefined -- raw-RPC isolation probe: shared connections are assigned in beforeAll, deliberately sequential awaits, undefined used for swallowed cleanup errors.
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { Connection } from '@temporalio/client';
import { msNumberToTs } from '@temporalio/common/lib/time';
import { temporal } from '@temporalio/proto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WORKFLOW_E2E_TEMPORAL_ADDRESS } from '../../test-utils/workflow-e2e-client.js';
import type { ITemporalJwtConfig } from './temporal-config.js';
import { temporalNamespaceFor } from './temporal-namespace.js';
import { TemporalTokenService } from './temporal-token.service.js';

/**
 * Temporal tenant isolation — phase 0 "red" test of ADR 0057 (private): one namespace per project
 * (`falang-<projectId>`), RS256 JWT authorization on the frontend, `system.enableCrossNamespaceCommands: false`.
 * A token that grants `write` on project A's namespace must give no access whatsoever to project B's namespace,
 * to cluster-level APIs, or (with no token at all) to anything but `GetSystemInfo`.
 *
 * Talks to Temporal's gRPC frontend directly (no `backend`, no runner pods): a workflow that nobody polls stays
 * Running, which is all the "victim" side needs, and the "attacker" side drives raw `Poll*`/`Respond*` RPCs
 * itself, exactly what code inside a tenant's runner pod could do with its own connection.
 *
 * RED on the stack as it is today (`default` namespace, no authorizer: every request passes), GREEN once the
 * stack runs Temporal with `global.authorization` + the `falang-temporal` audience + the cross-namespace flag off
 * (phase 3 of the ADR; verified on the phase-0 spike stack, see the ADR's "Implementation notes (phase 0)").
 *
 * Env:
 *  - `TEMPORAL_ADDRESS` — frontend (shared with every workflow-tier spec, default `localhost:7234`);
 *  - `TEMPORAL_JWT_PRIVATE_KEY` — PEM (PKCS#8) RSA key whose public half is served by `backend`'s JWKS (the same env
 *    `backend` has; tokens are minted by the real `TemporalTokenService`, `kid` defaults to the key's thumbprint exactly
 *    like the JWKS publishes it, `TEMPORAL_JWT_KEY_ID` overrides), audience in `TEMPORAL_JWT_AUDIENCE` (default
 *    `falang-temporal`). Unset => a throwaway key (tokens unverifiable, which is fine against an authorizer-less stack:
 *    it ignores them, and that is exactly why this spec is red there).
 *  - `TEMPORAL_TLS` — `true` to connect with TLS (default plaintext, matching the compose/kind stacks).
 */

const AUDIENCE = process.env.TEMPORAL_JWT_AUDIENCE ?? 'falang-temporal';
const USE_TLS = process.env.TEMPORAL_TLS === 'true';
const generatePrivateKeyPem = (): string =>
  generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const PRIVATE_KEY = process.env.TEMPORAL_JWT_PRIVATE_KEY ?? generatePrivateKeyPem();
const KEY_ID = process.env.TEMPORAL_JWT_KEY_ID;

/** The production token signer (same code `backend` runs), so the spec exercises exactly what pods and the backend get. */
const tokenService = (overrides: Partial<ITemporalJwtConfig> = {}): TemporalTokenService =>
  new TemporalTokenService({
    privateKeyPem: PRIVATE_KEY,
    keyId: KEY_ID,
    ttlSeconds: 300,
    audience: AUDIENCE,
    ...overrides,
  });

const namespaceFor = temporalNamespaceFor;
const projectToken = (projectId: string, ttlSeconds?: number): string =>
  tokenService(ttlSeconds ? { ttlSeconds } : {}).mintProjectToken(projectId).token;
const adminToken = (): string => tokenService().mintAdminToken().token;

const connect = (token?: string): Promise<Connection> =>
  Connection.connect({
    address: WORKFLOW_E2E_TEMPORAL_ADDRESS,
    ...(token ? { apiKey: token, tls: USE_TLS } : { tls: USE_TLS }),
    connectTimeout: 10_000,
  });

/**
 * Lazy: `Connection.connect` itself calls `GetSystemInfo` with the token and a *bad* token is refused even there
 * (phase-0 spike finding), so connecting with a deliberately bad token must not throw before the call under test.
 */
const connectLazy = (token: string): Connection =>
  Connection.lazy({ address: WORKFLOW_E2E_TEMPORAL_ADDRESS, apiKey: token, tls: USE_TLS });

const GRPC_PERMISSION_DENIED = 7;
const GRPC_UNAUTHENTICATED = 16;

const grpcCode = (error: unknown): number | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'number') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
};

/** Passes only if the call is refused by the authorizer — a `NotFound`, success or any other error is a failure. */
const expectDenied = async (label: string, call: () => Promise<unknown>): Promise<void> => {
  let outcome = 'was allowed (resolved)';
  try {
    await call();
  } catch (error) {
    const code = grpcCode(error);
    if (code === GRPC_PERMISSION_DENIED || code === GRPC_UNAUTHENTICATED) return;
    outcome = `failed with grpc ${String(code)}: ${String((error as Error).message).slice(0, 160)}`;
  }
  expect.fail(`${label}: expected PERMISSION_DENIED/UNAUTHENTICATED but the call ${outcome}`);
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Connects once Temporal accepts the backend's keys. Temporal fetches the JWKS from `backend` every 5 s
 * (`docker/temporal/server.yaml`) and refuses every token until a fetch succeeds, so a run started right after the
 * stack comes up was refused here — `backend`'s own `TemporalTenancyService` retries the same way.
 */
const connectWhenKeysLoaded = async (token: string, timeoutMs = 30_000): Promise<Connection> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await connect(token);
    } catch (error) {
      if (grpcCode(error) !== GRPC_PERMISSION_DENIED || Date.now() >= deadline) throw error;
      await sleep(1000);
    }
  }
};

const CommandType = temporal.api.enums.v1.CommandType;
type TCommand = temporal.api.command.v1.ICommand;

describe('temporal tenant isolation (workflow tier)', () => {
  const projectA = randomUUID();
  const projectB = randomUUID();
  const nsA = namespaceFor(projectA);
  const nsB = namespaceFor(projectB);
  const taskQueueA = `workflow-${projectA}`;
  const taskQueueB = `workflow-${projectB}`;
  const victimId = `victim-${Date.now()}`;

  let admin: Connection;
  let asA: Connection; // project A's token
  let anonymous: Connection;

  const startWorkflow = async (
    connection: Connection,
    namespace: string,
    workflowId: string,
    taskQueue: string,
  ): Promise<string> => {
    const response = await connection.workflowService.startWorkflowExecution({
      namespace,
      workflowId,
      workflowType: { name: 'isolationProbe' },
      taskQueue: { name: taskQueue },
      requestId: randomUUID(),
    });
    return response.runId;
  };

  beforeAll(async () => {
    admin = await connectWhenKeysLoaded(adminToken());
    asA = await connect(projectToken(projectA));
    anonymous = await connect();
    // Namespaces are created by the privileged side (backend's TemporalTenancyService in phase 1+).
    for (const namespace of [nsA, nsB]) {
      await admin.workflowService.registerNamespace({
        namespace,
        workflowExecutionRetentionPeriod: { seconds: 3 * 86_400 } as never,
      });
    }
    await sleep(3000); // frontend namespace-registry refresh
    // Victim: a Running workflow in B that nobody polls (the first workflow task just sits in the queue).
    await startWorkflow(admin, nsB, victimId, taskQueueB);
  }, 60_000);

  afterAll(async () => {
    for (const namespace of [nsA, nsB]) {
      await admin.operatorService.deleteNamespace({ namespace }).catch(() => undefined);
    }
    await Promise.allSettled([admin.close(), asA.close(), anonymous.close()]);
  });

  describe('(1) workflows of project B', () => {
    it('token A cannot signal, terminate, describe, read the result/history of a workflow in namespace B', async () => {
      await expectDenied('signal', () =>
        asA.workflowService.signalWorkflowExecution({
          namespace: nsB,
          workflowExecution: { workflowId: victimId },
          signalName: 'pwn',
          requestId: randomUUID(),
        }),
      );
      await expectDenied('terminate', () =>
        asA.workflowService.terminateWorkflowExecution({
          namespace: nsB,
          workflowExecution: { workflowId: victimId },
          reason: 'isolation test',
        }),
      );
      await expectDenied('describe', () =>
        asA.workflowService.describeWorkflowExecution({ namespace: nsB, execution: { workflowId: victimId } }),
      );
      await expectDenied('history (what getHandle().result() reads)', () =>
        asA.workflowService.getWorkflowExecutionHistory({ namespace: nsB, execution: { workflowId: victimId } }),
      );
      await expectDenied('start a workflow in B', () => startWorkflow(asA, nsB, `intruder-${Date.now()}`, taskQueueB));
      await expectDenied('reset', () =>
        asA.workflowService.resetWorkflowExecution({
          namespace: nsB,
          workflowExecution: { workflowId: victimId },
          workflowTaskFinishEventId: 3 as never,
          requestId: randomUUID(),
        }),
      );
    });
  });

  describe('(2) task queues of project B', () => {
    it('token A cannot long-poll workflow/activity tasks of B’s task queue', async () => {
      await expectDenied('pollWorkflowTaskQueue', () =>
        asA.withDeadline(Date.now() + 15_000, () =>
          asA.workflowService.pollWorkflowTaskQueue({
            namespace: nsB,
            taskQueue: { name: taskQueueB },
            identity: 'thief',
          }),
        ),
      );
      await expectDenied('pollActivityTaskQueue', () =>
        asA.withDeadline(Date.now() + 15_000, () =>
          asA.workflowService.pollActivityTaskQueue({
            namespace: nsB,
            taskQueue: { name: taskQueueB },
            identity: 'thief',
          }),
        ),
      );
    });
  });

  describe('(3) schedules of project B', () => {
    it('token A cannot create, patch, update or delete schedules in namespace B', async () => {
      const scheduleId = `sched-${Date.now()}`;
      await admin.workflowService.createSchedule({
        namespace: nsB,
        scheduleId,
        requestId: randomUUID(),
        schedule: {
          spec: { interval: [{ interval: msNumberToTs(3_600_000) }] },
          action: {
            startWorkflow: {
              workflowId: `sched-run-${scheduleId}`,
              workflowType: { name: 'isolationProbe' },
              taskQueue: { name: taskQueueB },
            },
          },
        },
      });
      await expectDenied('create schedule in B', () =>
        asA.workflowService.createSchedule({
          namespace: nsB,
          scheduleId: `evil-${Date.now()}`,
          requestId: randomUUID(),
          schedule: {
            spec: { interval: [{ interval: msNumberToTs(60_000) }] },
            action: {
              startWorkflow: {
                workflowId: 'evil',
                workflowType: { name: 'isolationProbe' },
                taskQueue: { name: taskQueueB },
              },
            },
          },
        }),
      );
      await expectDenied('describe schedule in B', () =>
        asA.workflowService.describeSchedule({ namespace: nsB, scheduleId }),
      );
      await expectDenied('pause schedule in B', () =>
        asA.workflowService.patchSchedule({
          namespace: nsB,
          scheduleId,
          patch: { pause: 'isolation test' },
          requestId: randomUUID(),
        }),
      );
      await expectDenied('delete schedule in B', () =>
        asA.workflowService.deleteSchedule({ namespace: nsB, scheduleId }),
      );
    });
  });

  describe('(4) listing', () => {
    it('token A cannot list workflows or schedules in namespace B', async () => {
      await expectDenied('listWorkflowExecutions', () =>
        asA.workflowService.listWorkflowExecutions({ namespace: nsB, query: '' }),
      );
      await expectDenied('countWorkflowExecutions', () =>
        asA.workflowService.countWorkflowExecutions({ namespace: nsB, query: '' }),
      );
      await expectDenied('listSchedules', () => asA.workflowService.listSchedules({ namespace: nsB }));
    });
  });

  describe('(5) cluster / namespace administration', () => {
    it('token A cannot register, update, delete or enumerate namespaces, or read cluster info', async () => {
      await expectDenied('registerNamespace', () =>
        asA.workflowService.registerNamespace({
          namespace: `falang-${randomUUID()}`,
          workflowExecutionRetentionPeriod: { seconds: 86_400 } as never,
        }),
      );
      await expectDenied('updateNamespace on B', () =>
        asA.workflowService.updateNamespace({
          namespace: nsB,
          config: { workflowExecutionRetentionTtl: { seconds: 86_400 } as never },
        } as never),
      );
      await expectDenied('describeNamespace B', () => asA.workflowService.describeNamespace({ namespace: nsB }));
      await expectDenied('listNamespaces', () => asA.workflowService.listNamespaces({}));
      await expectDenied('getClusterInfo', () => asA.workflowService.getClusterInfo({}));
      await expectDenied('operator deleteNamespace B', () => asA.operatorService.deleteNamespace({ namespace: nsB }));
      await expectDenied('operator addSearchAttributes on A (admin-level in its own namespace)', () =>
        asA.operatorService.addSearchAttributes({
          namespace: nsA,
          searchAttributes: { FalangIsolation: temporal.api.enums.v1.IndexedValueType.INDEXED_VALUE_TYPE_KEYWORD },
        }),
      );
      await expectDenied('operator listClusters', () => asA.operatorService.listClusters({}));
    });
  });

  describe('(6) no token', () => {
    it('is refused everywhere except GetSystemInfo', async () => {
      const info = await anonymous.workflowService.getSystemInfo({});
      expect(info.serverVersion).toBeTruthy();
      await expectDenied('anonymous describeNamespace A', () =>
        anonymous.workflowService.describeNamespace({ namespace: nsA }),
      );
      await expectDenied('anonymous listNamespaces', () => anonymous.workflowService.listNamespaces({}));
      await expectDenied('anonymous start in A', () => startWorkflow(anonymous, nsA, `anon-${Date.now()}`, taskQueueA));
      await expectDenied('anonymous signal victim in B', () =>
        anonymous.workflowService.signalWorkflowExecution({
          namespace: nsB,
          workflowExecution: { workflowId: victimId },
          signalName: 'pwn',
          requestId: randomUUID(),
        }),
      );
      await expectDenied('anonymous poll', () =>
        anonymous.withDeadline(Date.now() + 15_000, () =>
          anonymous.workflowService.pollWorkflowTaskQueue({
            namespace: nsA,
            taskQueue: { name: taskQueueA },
            identity: 'anon',
          }),
        ),
      );
    });
  });

  describe('(7) cross-namespace commands sent through RespondWorkflowTaskCompleted', () => {
    // Raw proto, as a compromised runner could: poll A's own task, answer it with a command aimed at B.
    const respondWith = async (command: TCommand): Promise<void> => {
      const attackerId = `attacker-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      await startWorkflow(asA, nsA, attackerId, taskQueueA);
      const task = await asA.withDeadline(Date.now() + 60_000, () =>
        asA.workflowService.pollWorkflowTaskQueue({
          namespace: nsA,
          taskQueue: { name: taskQueueA },
          identity: 'raw-attacker',
        }),
      );
      await asA.workflowService.respondWorkflowTaskCompleted({
        namespace: nsA,
        taskToken: task.taskToken,
        identity: 'raw-attacker',
        commands: [command],
      });
    };

    const victimSignalCount = async (signalName: string): Promise<number> => {
      const history = await admin.workflowService.getWorkflowExecutionHistory({
        namespace: nsB,
        execution: { workflowId: victimId },
      });
      return (history.history?.events ?? []).filter(
        (event) => event.workflowExecutionSignaledEventAttributes?.signalName === signalName,
      ).length;
    };

    it('SignalExternalWorkflowExecution into B is rejected and never delivered', async () => {
      let rejected = false;
      try {
        await respondWith({
          commandType: CommandType.COMMAND_TYPE_SIGNAL_EXTERNAL_WORKFLOW_EXECUTION,
          signalExternalWorkflowExecutionCommandAttributes: {
            namespace: nsB,
            execution: { workflowId: victimId },
            signalName: 'cross-ns-pwn',
          },
        });
      } catch {
        rejected = true;
      }
      await sleep(2000);
      expect(await victimSignalCount('cross-ns-pwn'), 'B must not receive the cross-namespace signal').toBe(0);
      expect(rejected, 'the Respond call must be refused outright').toBe(true);
    });

    it('StartChildWorkflowExecution with namespace B is rejected and creates nothing in B', async () => {
      const childId = `cross-child-${Date.now()}`;
      let rejected = false;
      try {
        await respondWith({
          commandType: CommandType.COMMAND_TYPE_START_CHILD_WORKFLOW_EXECUTION,
          startChildWorkflowExecutionCommandAttributes: {
            namespace: nsB,
            workflowId: childId,
            workflowType: { name: 'isolationProbe' },
            taskQueue: { name: taskQueueB },
          },
        });
      } catch {
        rejected = true;
      }
      await sleep(2000);
      // The child must NOT exist in B: describing it with the admin token has to come back NotFound (grpc 5).
      let childLookup: number | undefined;
      try {
        await admin.workflowService.describeWorkflowExecution({ namespace: nsB, execution: { workflowId: childId } });
      } catch (error) {
        childLookup = grpcCode(error);
      }
      expect(childLookup, 'no child workflow may be created in B').toBe(5);
      expect(rejected, 'the Respond call must be refused outright').toBe(true);
    });

    it('RequestCancelExternalWorkflowExecution into B is rejected and B’s workflow is not cancelled', async () => {
      let rejected = false;
      try {
        await respondWith({
          commandType: CommandType.COMMAND_TYPE_REQUEST_CANCEL_EXTERNAL_WORKFLOW_EXECUTION,
          requestCancelExternalWorkflowExecutionCommandAttributes: {
            namespace: nsB,
            workflowId: victimId,
          },
        });
      } catch {
        rejected = true;
      }
      await sleep(2000);
      const history = await admin.workflowService.getWorkflowExecutionHistory({
        namespace: nsB,
        execution: { workflowId: victimId },
      });
      const cancelRequested = (history.history?.events ?? []).some(
        (event) => event.workflowExecutionCancelRequestedEventAttributes,
      );
      expect(cancelRequested, 'B must not get a cancel request').toBe(false);
      expect(rejected, 'the Respond call must be refused outright').toBe(true);
    });
  });

  describe('(8) control: the same token does everything it should in its own namespace', () => {
    it('token A starts, signals, describes and polls in namespace A; lists its own schedules', async () => {
      const workflowId = `own-${Date.now()}`;
      await startWorkflow(asA, nsA, workflowId, taskQueueA);
      await asA.workflowService.signalWorkflowExecution({
        namespace: nsA,
        workflowExecution: { workflowId },
        signalName: 'ping',
        requestId: randomUUID(),
      });
      const description = await asA.workflowService.describeWorkflowExecution({
        namespace: nsA,
        execution: { workflowId },
      });
      expect(description.workflowExecutionInfo?.execution?.workflowId).toBe(workflowId);
      const task = await asA.withDeadline(Date.now() + 60_000, () =>
        asA.workflowService.pollWorkflowTaskQueue({
          namespace: nsA,
          taskQueue: { name: taskQueueA },
          identity: 'own-worker',
        }),
      );
      expect(task.taskToken?.length).toBeGreaterThan(0);
      await asA.workflowService.terminateWorkflowExecution({
        namespace: nsA,
        workflowExecution: { workflowId },
        reason: 'cleanup',
      });
      const schedules = await asA.workflowService.listSchedules({ namespace: nsA });
      expect(Array.isArray(schedules.schedules)).toBe(true);
    });
  });

  describe('(9) token validity', () => {
    it('refuses an expired token, a token for another audience and a token signed with an unknown key', async () => {
      const expired = connectLazy(projectToken(projectA, 2));
      await sleep(4000);
      await expectDenied('expired token', () => expired.workflowService.describeNamespace({ namespace: nsA }));
      const wrongAudience = connectLazy(tokenService({ audience: 'someone-else' }).mintProjectToken(projectA).token);
      await expectDenied('wrong audience', () => wrongAudience.workflowService.describeNamespace({ namespace: nsA }));
      const forged = connectLazy(
        tokenService({ privateKeyPem: generatePrivateKeyPem(), keyId: undefined }).mintAdminToken().token,
      );
      await expectDenied('token signed with a foreign key claiming temporal-system:admin', () =>
        forged.workflowService.listNamespaces({}),
      );
      await Promise.allSettled([expired.close(), wrongAudience.close(), forged.close()]);
    }, 30_000);
  });

  // The tokens above come from the real `TemporalTokenService`. Still open (stack-level, needs real projects): publish
  // A and B through backend and assert the runner pod's Worker (token from `POST /internal/projects/:projectId/temporal-token`,
  // refreshed at half TTL by `start-runner.ts`) keeps working past `TEMPORAL_JWT_TTL_SECONDS=20` (spike result:
  // NativeConnection.setApiKey refresh works, no refresh => the worker stops after the TTL). The refresh logic itself is
  // unit-tested in `@falang/workflow-runner`'s `temporal-token-refresher.test.ts`.
  it.todo('a runner pod keeps executing workflows after 2x token TTL (needs the backend token endpoint)');
});
