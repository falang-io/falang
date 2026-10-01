// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
// oxlint-disable max-lines -- grew past 300 lines from ADR 0025 (private)'s VersioningModule wiring and ADR 0029 (private)'s McpModule consumers landing in the same merge; both additions are a handful of lines each, not accumulated complexity.
import { join } from 'node:path';
import { AppsV1Api, KubeConfig } from '@kubernetes/client-node';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { POSITION_QUERY_NAME, type IWorkflowPositionFrame } from '@falang/workflow-compiler';
import { WorkflowNotFoundError } from '@temporalio/client';
import { TEMPORAL_TENANCY, type ITemporalTenancy } from '@falang/workflow-gateway';
import { arrayFromPayloads, defaultPayloadConverter } from '@temporalio/common';
import { temporal } from '@temporalio/proto';
import { DebugController } from '../debug/debug.controller.js';
import { DebugService } from '../debug/debug.service.js';
import { createDebugService } from '../debug/workflow-debug-client-impl.js';
import { FilesModule } from '../../files/files.module.js';
import { IntegrationsModule } from '../../integrations/integrations.module.js';
import { ProjectTokenModule } from '../../internal-auth/project-token.module.js';
import { DocumentsModule } from '../../projects/documents/documents.module.js';
import { DocumentsService } from '../../projects/documents/documents.service.js';
import { ProjectsModule } from '../../projects/projects/projects.module.js';
import { VersioningModule } from '../../projects/versioning/versioning.module.js';
import { BuildController } from './build.controller.js';
import { UserLimitsModule } from '../../admin/user-limits/user-limits.module.js';
import { BuildService, BUILD_OUTPUT_DIR } from './build.service.js';
import { DeploymentCliService } from './deployment-cli.service.js';
import { DevArtifactStore } from './dev-artifact-store.service.js';
import { InternalArtifactsController } from './internal-artifacts.controller.js';
import { InternalCoverageController } from './internal-coverage.controller.js';
import { createK8sDeploymentsClient } from './k8s-deployments-client.js';
import { ProjectVersion } from './project-version.entity.js';
import { RUNNER_IDLE_TIMEOUT_MS, RunnerIdleSweepService } from './runner-idle-sweep.service.js';
import { RunnerProcessManager } from './runner-process-manager.js';
import { ScheduleWakeService } from './schedule-wake.service.js';
import { terminateRunningExecutionsWith, type ITerminatableWorkflowHandle } from './terminate-running-executions.js';
import { readFailureMessage, readFailurePosition, type TGetWorkflowPosition } from './workflow-position.js';
import {
  WorkflowRunService,
  type TStartAndAwaitWorkflow,
  type TStartWorkflow,
  type TTerminateRunningExecutions,
} from './workflow-run.service.js';

/**
 * How long a `falang-position` query may wait for the Worker before `getWorkflowPosition` reports
 * `'unavailable'` — a query is dispatched as a task to the execution's Worker, so with the runner pod
 * down (idle-scaled, see ADR 0016 (private)) it would otherwise hang for the connection's default
 * deadline. Short, since the client polls this every second (ADR 0022 (private)).
 */
const POSITION_QUERY_DEADLINE_MS = 3000;

// Must live inside this repo's node_modules-resolvable tree: Temporal's workflow bundler does
// standard Node module resolution from the compiled file's own directory upward to find
// `@temporalio/workflow` — an arbitrary OS temp dir (outside the repo) can't resolve it. Only the
// parent of per-build `mkdtemp` directories now (`build-artifact.ts` creates one per build and
// removes it in `finally`; nothing persistent lives here) — see the security audit's P0-7.
const BUILD_OUTPUT_DIR_PATH = join(__dirname, '..', '..', '..', '..', '.builds');

// Every closure resolves the project's own namespace client through `ITemporalTenancy` — a shared,
// pooled connection that is never closed per call (ADR 0050 (private); it used to connect fresh per call).
const createStartAndAwaitWorkflow =
  (tenancy: ITemporalTenancy): TStartAndAwaitWorkflow =>
  async ({ projectId, taskQueue, workflowId, functionName, args }) => {
    try {
      const client = await tenancy.getClient(projectId);
      const handle = await client.workflow.start(functionName, { taskQueue, workflowId, args: [...args] });
      const result = await handle.result();
      return { status: 'completed', result };
    } catch (error) {
      return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  };

const createStartWorkflow =
  (tenancy: ITemporalTenancy): TStartWorkflow =>
  async ({ projectId, taskQueue, workflowId, functionName, args }) => {
    const client = await tenancy.getClient(projectId);
    const handle = await client.workflow.start(functionName, { taskQueue, workflowId, args: [...args] });
    return { runId: handle.firstExecutionRunId };
  };

const decodePayloads = (payloads: temporal.api.common.v1.IPayloads | null | undefined): unknown => {
  if (!payloads?.payloads || payloads.payloads.length === 0) return null;
  const values = arrayFromPayloads(defaultPayloadConverter, payloads.payloads);
  return values.length === 1 ? values[0] : values;
};

/**
 * See `IWorkflowPosition` for the contract. A running execution is asked live via the compiled
 * runtime's `falang-position` query (bounded by `POSITION_QUERY_DEADLINE_MS` — a query with no
 * Worker polling would otherwise block); a failed one is read from its `WorkflowExecutionFailed`
 * event's failure details, no Worker involved; anything else has no position to report.
 */
const createGetWorkflowPosition =
  (tenancy: ITemporalTenancy): TGetWorkflowPosition =>
  async ({ projectId, workflowId, runId }) => {
    const client = await tenancy.getClient(projectId);
    const handle = client.workflow.getHandle(workflowId, runId);
    const description = await handle.describe().catch((error: unknown) => {
      if (error instanceof WorkflowNotFoundError) return null;
      throw error;
    });
    if (!description) return null;
    const base = { workflowId, runId, status: description.status.name, taskQueue: description.taskQueue };

    if (description.status.name === 'RUNNING') {
      try {
        const stack = await client.connection.withDeadline(Date.now() + POSITION_QUERY_DEADLINE_MS, () =>
          handle.query<IWorkflowPositionFrame[]>(POSITION_QUERY_NAME),
        );
        return { ...base, source: 'query', stack };
      } catch {
        return { ...base, source: 'unavailable', stack: null };
      }
    }

    if (description.status.name === 'FAILED') {
      const history = await handle.fetchHistory();
      const failure = history.events?.find(
        (event) => event.eventType === temporal.api.enums.v1.EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED,
      )?.workflowExecutionFailedEventAttributes?.failure;
      const details = readFailurePosition(failure, decodePayloads);
      const failureMessage = readFailureMessage(failure);
      return {
        ...base,
        source: details ? 'failure' : 'none',
        stack: details?.position ?? null,
        ...(failureMessage === null ? {} : { failureMessage }),
      };
    }

    return { ...base, source: 'none', stack: null };
  };

// Default for `DEV_EXECUTION_CANCEL_GRACE_MS` — see `createTerminateRunningExecutions`'s doc comment
// and ADR 0040 (private) §4/§5.
const DEFAULT_DEV_EXECUTION_CANCEL_GRACE_MS = 10_000;

// `taskQueue` is always `workflow-dev-<projectId>`/`workflow-<projectId>` built from a UUID
// already validated against an owned project (see `BuildService.build()`'s `listFull` call), so
// embedding it directly in the visibility query below is safe — it can't contain a stray quote.
//
// Builds the real `TTerminateRunningExecutions` closure `WorkflowRunService.terminateRunningOn`
// calls through, over `terminateRunningExecutionsWith`'s cancel-then-grace-then-terminate logic (see
// its own doc comment and ADR 0040 (private) §4/§5) — like every other closure in this file — namespace-bound client from `ITemporalTenancy`. `graceMs` is bound once per process (from
// `DEV_EXECUTION_CANCEL_GRACE_MS`, see the `WorkflowRunService` provider below), not threaded through
// `ITerminateRunningExecutionsParams` — it's a deployment-wide constant, not something that varies
// per call the way `taskQueue`/`projectId` do.
const createTerminateRunningExecutions = (graceMs: number, tenancy: ITemporalTenancy): TTerminateRunningExecutions =>
  async function terminateRunningExecutions({ projectId, taskQueue }) {
    const client = await tenancy.getClient(projectId);
    return await terminateRunningExecutionsWith(
      {
        listRunning: async (queue) => {
          const handles: ITerminatableWorkflowHandle[] = [];
          for await (const execution of client.workflow.list({
            query: `TaskQueue = '${queue}' AND ExecutionStatus = 'Running'`,
          })) {
            const handle = client.workflow.getHandle(execution.workflowId, execution.runId);
            handles.push({
              async cancel() {
                try {
                  await handle.cancel();
                } catch (error) {
                  if (!(error instanceof WorkflowNotFoundError)) throw error;
                }
              },
              async isRunning() {
                const description = await handle.describe().catch((error: unknown) => {
                  if (error instanceof WorkflowNotFoundError) return null;
                  throw error;
                });
                return description?.status.name === 'RUNNING';
              },
              async terminate(reason) {
                try {
                  await handle.terminate(reason);
                } catch (error) {
                  if (!(error instanceof WorkflowNotFoundError)) throw error;
                }
              },
            });
          }
          return handles;
        },
      },
      taskQueue,
      graceMs,
    );
  };

@Module({
  imports: [
    ProjectsModule,
    DocumentsModule,
    IntegrationsModule,
    ProjectTokenModule,
    // `BuildService.deleteProject` also removes the project's S3 objects (see
    // ADR 0038 (private) §2) — `FilesModule` doesn't import
    // `BuildModule` back, so this creates no cycle.
    FilesModule,
    // Per-owner `maxConcurrentProdVersions` (see `BuildService.getMaxConcurrentProdVersions`).
    UserLimitsModule,
    // Publish auto-commits the working copy before compiling (ADR 0025 (private),
    // "Ties to ProjectVersion") — imported here, not the other way around: `VersioningModule` must not
    // import `BuildModule`, or the two would form a circular module dependency.
    VersioningModule,
    TypeOrmModule.forFeature([ProjectVersion]),
  ],
  controllers: [BuildController, DebugController, InternalArtifactsController, InternalCoverageController],
  providers: [
    BuildService,
    DevArtifactStore,
    RunnerIdleSweepService,
    // Waking a scaled-down pod ahead of a schedule's next fire (ADR 0037 (private)
    // §5) — depends on `BuildService` (for its `ensureRunnerRunning` wrapper) and, transitively via
    // `GatewayModule`'s `global: true` registration in `app.module.ts`, `SCHEDULE_CLIENT_PORT` — neither
    // needs an explicit `imports` entry here.
    ScheduleWakeService,
    { provide: BUILD_OUTPUT_DIR, useValue: BUILD_OUTPUT_DIR_PATH },
    {
      // Default 30 minutes — generous enough that a person actively iterating in the editor (dev)
      // or a lightly-used published workflow (prod) shouldn't see their pod scaled down mid-session,
      // while still bounding cost for projects nobody's touched in a while. See
      // ADR 0016 (private)'s Phase 2 "Scale-to-zero" follow-up.
      provide: RUNNER_IDLE_TIMEOUT_MS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get<number>('RUNNER_IDLE_TIMEOUT_MS', 30 * 60 * 1000),
    },
    {
      provide: RunnerProcessManager,
      inject: [ConfigService, TEMPORAL_TENANCY],
      useFactory: (config: ConfigService, tenancy: ITemporalTenancy) => {
        // `loadFromDefault()` reads `KUBECONFIG` (falling back to `~/.kube/config`, or in-cluster
        // service-account credentials when running as a pod itself) — the same convention every
        // other k8s tool (`kubectl`, Helm, …) follows, so no bespoke config surface for it here.
        const kubeConfig = new KubeConfig();
        kubeConfig.loadFromDefault();
        const appsApi = kubeConfig.makeApiClient(AppsV1Api);

        return new RunnerProcessManager({
          deploymentsClient: createK8sDeploymentsClient(appsApi),
          k8sNamespace: config.get<string>('K8S_NAMESPACE', 'workflow'),
          runnerImage: config.get<string>('RUNNER_IMAGE', 'falang-workflow-runner:local'),
          runnerServiceAccount: config.get<string>('RUNNER_SERVICE_ACCOUNT'),
          // `RUNNER_TEMPORAL_ADDRESS` overrides `TEMPORAL_ADDRESS` for pods specifically — needed
          // wherever `backend` and its runner pods reach Temporal by a different address (e.g.
          // local `kind`: `backend` resolves `temporal:7233` on its own docker network, but a pod
          // has no such DNS name and must reach it via the docker-network-gateway address instead —
          // see docker-compose.workflow.yml). In a real cluster both usually coincide, so this only
          // needs setting where they don't.
          temporalAddress: config.get<string>('RUNNER_TEMPORAL_ADDRESS') ?? config.get<string>('TEMPORAL_ADDRESS'),
          namespace: config.get<string>('TEMPORAL_NAMESPACE'),
          // Namespace-per-project isolation (ADR 0050 (private)): in `per-project` mode the pod's own
          // namespace, its token URL and TLS flag are derived from this instead of `namespace` above.
          tenancy,
          temporalTls: config.get<string>('TEMPORAL_TLS') === 'true',
          // Must be reachable from *inside* the k8s cluster (a cluster-internal Service DNS name
          // in a real deployment; a docker-network-reachable host address for local `kind`) — unlike
          // when `runner` was a same-host child process, `localhost` no longer resolves to `backend`
          // from a runner pod, so there's deliberately no such fallback default here anymore.
          internalApiUrl: config.get<string>('BACKEND_INTERNAL_URL'),
          // See ADR 0010 (private). `RUNNER_ACTIVEPIECES_SERVICE_URL`
          // overrides `ACTIVEPIECES_SERVICE_URL` for pods, same reasoning as `RUNNER_TEMPORAL_ADDRESS`
          // above — `backend`'s own calls to it (`ActivepiecesCatalogService`, field-options lookups)
          // use the docker-internal address, a pod needs the gateway one.
          activepiecesServiceUrl:
            config.get<string>('RUNNER_ACTIVEPIECES_SERVICE_URL') ?? config.get<string>('ACTIVEPIECES_SERVICE_URL'),
          // `RUNNER_TELEGRAM_API_BASE_URL` overrides `TELEGRAM_API_BASE_URL` for pods specifically,
          // same reasoning as `RUNNER_TEMPORAL_ADDRESS`/`RUNNER_ACTIVEPIECES_SERVICE_URL` above —
          // needed wherever a runner pod can't reach the same address `backend` itself would use
          // (e.g. the e2e stack's Telegram mock, only resolvable from inside `backend`'s own
          // network by its docker-internal name).
          telegramApiBaseUrl: config.get<string>('RUNNER_TELEGRAM_API_BASE_URL') ?? config.get<string>('TELEGRAM_API_BASE_URL'),
          // See ADR 0041 (private). `RUNNER_MEDIA_SERVICE_URL` overrides
          // `MEDIA_SERVICE_URL` for pods, same reasoning as `RUNNER_ACTIVEPIECES_SERVICE_URL`/
          // `RUNNER_TELEGRAM_API_BASE_URL` above.
          mediaServiceUrl: config.get<string>('RUNNER_MEDIA_SERVICE_URL') ?? config.get<string>('MEDIA_SERVICE_URL'),
          // Not a connection target (see `IRunnerProcessManagerParams.backendPublicUrl`'s doc
          // comment) — no docker-network/`kind` mismatch to work around, so no `RUNNER_*` override.
          backendPublicUrl: config.get<string>('BACKEND_PUBLIC_URL'),
          // Read directly off `process.env`, not `ConfigService` — matches `main.ts`'s own
          // `registerCoverageShutdownHook` gate exactly (same flag, same reasoning: this process
          // was spawned for a coverage-instrumented run). See `IRunnerProcessManagerParams`'s
          // `coverageEnabled` doc comment.
          coverageEnabled: Boolean(process.env.NODE_V8_COVERAGE),
        });
      },
    },
    {
      provide: DeploymentCliService,
      inject: [TEMPORAL_TENANCY],
      useFactory: (tenancy: ITemporalTenancy) => new DeploymentCliService({ tenancy }),
    },
    {
      provide: WorkflowRunService,
      inject: [ConfigService, TEMPORAL_TENANCY],
      useFactory: (config: ConfigService, tenancy: ITemporalTenancy) =>
        new WorkflowRunService({
          startAndAwaitWorkflow: createStartAndAwaitWorkflow(tenancy),
          // How long a cancelled dev execution gets to actually finish (its own `finally`/
          // `CancellationScope.nonCancellable` close-on-cancel, ADR 0040 (private) §4/§5) before
          // `createTerminateRunningExecutions` falls back to a hard `terminate()` — see its own
          // doc comment above.
          terminateRunningExecutions: createTerminateRunningExecutions(
            config.get<number>('DEV_EXECUTION_CANCEL_GRACE_MS', DEFAULT_DEV_EXECUTION_CANCEL_GRACE_MS),
            tenancy,
          ),
          startWorkflow: createStartWorkflow(tenancy),
          getWorkflowPosition: createGetWorkflowPosition(tenancy),
        }),
    },
    {
      provide: DebugService,
      inject: [DocumentsService, DevArtifactStore, WorkflowRunService, BuildService, TEMPORAL_TENANCY],
      useFactory: createDebugService,
    },
  ],
  // `BuildService`/`DebugService` are consumed directly by `McpModule` (ADR 0029 (private) phase F) — every other
  // pre-existing consumer of this module only used its
  // own controllers, so nothing was exported before this.
  exports: [BuildService, DebugService],
})
export class BuildModule {}
