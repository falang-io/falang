import { Client, Connection } from '@temporalio/client';
import request from 'supertest';
import { resolveTemporalConfig } from '../domains/temporal/temporal-config.js';
import { temporalNamespaceFor } from '../domains/temporal/temporal-namespace.js';
import { TemporalTokenService } from '../domains/temporal/temporal-token.service.js';

/**
 * Base URL for `backend`'s real, already-running instance in `docker-compose.workflow-e2e.yml` —
 * see ADR 0018 (private). No in-process `AppModule`/`RunnerProcessManager`
 * is booted here: a workflow-tier test is a plain HTTP client against the real stack (real Temporal,
 * real k8s runner pods on `kind`, real mock vendors), the same shape `@falang/workflow-e2e-tests`'
 * browser-tier specs already use for their own API seeding (`fixtures.ts`'s `createApiContext`) —
 * only without a browser driving the rest. Defaults to the stack's host-published port (matches
 * ADR 0016 (private)'s own host-direct live-verification approach); override with `BACKEND_URL`,
 * the same env var name `@falang/workflow-e2e-tests` already uses, once this runs from inside the
 * `e2e-tests` container instead (docker-internal `http://backend:4000`).
 */
export const WORKFLOW_E2E_BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4001';

/** Same `TEMPORAL_ADDRESS` convention as `@falang/workflow-e2e-tests`' own specs. */
export const WORKFLOW_E2E_TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'localhost:7234';

/** Reachable from this test process itself — use for direct calls to a mock's own fixture routes (`queueOpenAiResponse`, `getTelegramCalls`, …), never for a URL embedded into workflow-node/credential data. Defaults to the stack's host-published port for `mocks` (see `docker-compose.workflow-e2e.yml`'s `mocks` service, `4102:4100`). Mirrors `@falang/workflow-e2e-tests`' `integration-test-helpers.ts` `MOCKS_URL`. */
export const WORKFLOW_E2E_MOCKS_URL = process.env.MOCKS_URL ?? 'http://localhost:4102';

/**
 * Reachable from *inside* a runner pod on the `kind` cluster, not this test process — use whenever a
 * mocks URL is embedded into workflow-node/credential data a pod's compiled activity fetches at
 * execution time (an HTTP Request node's `url`, an OpenAI credential's `baseUrl`). Same
 * `KIND_GATEWAY_IP`-via-docker-bridge-gateway convention `docker-compose.workflow-e2e.yml`'s own
 * `e2e-tests`/`backend` services already use for their `RUNNER_*` overrides — set `KIND_GATEWAY_IP`
 * in the shell before running this against a non-default Docker bridge (see
 * `scripts/kind-cluster-setup.sh`'s own note). Mirrors `RUNNER_MOCKS_URL` in `@falang/workflow-e2e-tests`.
 */
export const WORKFLOW_E2E_RUNNER_MOCKS_URL =
  process.env.RUNNER_MOCKS_URL ?? `http://${process.env.KIND_GATEWAY_IP ?? '172.18.0.1'}:4102`;

/**
 * Same `KIND_GATEWAY_IP`-via-docker-bridge-gateway address as `WORKFLOW_E2E_RUNNER_MOCKS_URL`, for
 * ADR 0039 (private)'s `postgres-user-db`/`mysql-user-db` e2e services
 * (`docker-compose.workflow-e2e.yml`, host ports `5435`/`3308`). Embed this host in a seeded
 * credential's `connectionString` — it's the one address reachable both from `backend` itself (the
 * "Sync structure" call, which connects directly with `pg`/`mysql2`, same reachability requirement as
 * `RUNNER_TEMPORAL_ADDRESS`/`BACKEND_INTERNAL_URL` on that service) and from a runner pod on the
 * `kind` cluster (the compiled `postgres-*`/`mysql-*` activities) — since the credential's
 * `connectionString` is one shared value, not one per caller.
 */
export const WORKFLOW_E2E_RUNNER_DB_HOST = process.env.KIND_GATEWAY_IP ?? '172.18.0.1';

/** `postgres-user-db`'s host-published port (`docker-compose.workflow-e2e.yml`, `5435:5432`) — for a
 *  direct `pg` connection from *this* test process (not a pod), e.g. to confirm a row was really
 *  deleted after the workflow under test claims it deleted it. */
export const WORKFLOW_E2E_POSTGRES_USER_DB_URL = 'postgres://falang:falang@localhost:5435/userdb';

/** `mysql-user-db`'s host-published port (`docker-compose.workflow-e2e.yml`, `3308:3306`) — for a
 *  direct `mysql2` connection from *this* test process, mirrors `WORKFLOW_E2E_POSTGRES_USER_DB_URL`. */
export const WORKFLOW_E2E_MYSQL_USER_DB_URL = 'mysql://falang:falang@localhost:3308/userdb';

/**
 * `falang-workflow-activepieces`'s own test-only fixture routes (`src/routes/mock.ts`), reachable
 * from this test process directly (not embedded into workflow-node/credential data, unlike
 * `WORKFLOW_E2E_RUNNER_MOCKS_URL`) — see `docker-compose.workflow-e2e.yml`'s `activepieces` service
 * (`4103:4100`). Mirrors `@falang/workflow-e2e-tests`' `activepieces-mock-helpers.ts`.
 */
export const WORKFLOW_E2E_ACTIVEPIECES_URL = process.env.ACTIVEPIECES_URL ?? 'http://localhost:4103';
export const WORKFLOW_E2E_ACTIVEPIECES_SERVICE_SECRET =
  process.env.ACTIVEPIECES_SERVICE_SECRET ?? 'e2e-activepieces-secret';

/**
 * `falang-workflow-e2e`'s `media` service's own job API (`POST /jobs`, `GET /jobs/:jobId`, …),
 * reachable from this test process directly (not embedded into workflow-node/credential data,
 * unlike `WORKFLOW_E2E_RUNNER_MEDIA_URL` below) — see `docker-compose.workflow-e2e.yml`'s `media`
 * service (`4204:4200`) and ADR 0041 (private). For a future workflow-tier
 * media spec to drive/inspect jobs directly, mirroring `WORKFLOW_E2E_ACTIVEPIECES_URL` above.
 */
export const WORKFLOW_E2E_MEDIA_URL = process.env.MEDIA_URL ?? 'http://localhost:4204';

/**
 * Reachable from *inside* a runner pod on the `kind` cluster, not this test process — same
 * `KIND_GATEWAY_IP`-via-docker-bridge-gateway convention as `WORKFLOW_E2E_RUNNER_MOCKS_URL` above,
 * matching `docker-compose.workflow-e2e.yml`'s `backend` env `RUNNER_MEDIA_SERVICE_URL` (which
 * `media-*` action activities resolve `MEDIA_SERVICE_URL` from at runtime).
 */
export const WORKFLOW_E2E_RUNNER_MEDIA_URL =
  process.env.RUNNER_MEDIA_SERVICE_URL ?? `http://${process.env.KIND_GATEWAY_IP ?? '172.18.0.1'}:4204`;

/**
 * Egress proxy (ADR 0056 (private)) as configured into admin settings — the one URL both `backend` (docker
 * network) and runner pods (kind) can reach (`docker-compose.workflow-e2e.yml`'s `proxy`, host port `4301` via the
 * docker-bridge gateway). `WORKFLOW_E2E_PROXY_STATS_URL` is the same service as seen from this test process.
 */
export const WORKFLOW_E2E_PROXY_URL =
  process.env.E2E_PROXY_URL ?? `http://${process.env.KIND_GATEWAY_IP ?? '172.18.0.1'}:4301`;
export const WORKFLOW_E2E_PROXY_TOKEN = process.env.E2E_PROXY_TOKEN ?? 'e2e-proxy-token';
export const WORKFLOW_E2E_PROXY_STATS_URL = process.env.E2E_PROXY_STATS_URL ?? 'http://localhost:4301';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

/** Logs into the real, already-seeded admin account — see ADR 0016 (private)'s Phase 0 self-service-signup seed. */
export const workflowE2eLogin = async (): Promise<string> => {
  const response = await request(WORKFLOW_E2E_BACKEND_URL)
    .post('/auth/login')
    .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  return (response.body as { accessToken: string }).accessToken;
};

export const workflowE2eAuth = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

/** A fresh `supertest` client for `backend`'s real e2e-stack instance — call once per request, mirrors `request(app.getHttpServer())`'s own per-call usage in `*.e2e.test.ts`. */
export const workflowE2eApi = (): ReturnType<typeof request> => request(WORKFLOW_E2E_BACKEND_URL);

/**
 * Polls `condition` until it returns `true` or `timeoutMs` elapses — mirrors
 * `@falang/workflow-e2e-tests`' own `waitForCondition`, reimplemented here rather than imported
 * across the package boundary (that package is Playwright-specific, not meant to be a shared dep).
 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const workflowE2eWaitFor = async (condition: () => Promise<boolean>, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- inherently sequential polling.
    if (await condition()) return;
    if (Date.now() >= deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    // oxlint-disable-next-line no-await-in-loop -- inherently sequential polling.
    await delay(500);
  }
};

/**
 * Same polling shape as `workflowE2eWaitFor`, but for a `check` that returns a value once satisfied
 * rather than a plain boolean — mirrors `@falang/workflow-e2e-tests`' own `waitForCondition`
 * (`integration-test-helpers.ts`), needed for specs that poll a mock's own recorded calls (e.g.
 * "wait for the `sendMessage` call, then assert on its body"). `check` should return a truthy value
 * once the condition holds (never legitimately falsy for these tests' use — every value polled for
 * here is an object/array).
 */
export const workflowE2eWaitForValue = async <T>(
  check: () => Promise<T | undefined>,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- inherently sequential polling.
    const result = await check();
    if (result) return result;
    if (Date.now() >= deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    // oxlint-disable-next-line no-await-in-loop -- inherently sequential polling.
    await delay(intervalMs);
  }
};

/** Every project gets one pinned `integrations` document auto-created alongside it (see ADR 0006) — this finds its id so credentials can be seeded via `PATCH .../documents/:id`, mirrors `@falang/workflow-e2e-tests`' `fixtures.ts` `getIntegrationsDocumentId`. */
export const workflowE2eGetIntegrationsDocumentId = async (token: string, projectId: string): Promise<string> => {
  const response = await workflowE2eApi().get(`/projects/${projectId}/tree`).set(workflowE2eAuth(token));
  const body = response.body as { documents: readonly { id: string; type: string }[] };
  const doc = body.documents.find((item) => item.type === 'integrations');
  if (!doc) throw new Error(`Project ${projectId} has no pinned integrations document`);
  return doc.id;
};

/**
 * A Temporal client for `projectId` as the e2e stack runs it (ADR 0057 (private)): with
 * `TEMPORAL_TENANT_ISOLATION=per-project` (+ `TEMPORAL_JWT_PRIVATE_KEY`, the same env `backend` has) it
 * connects with a short-lived admin JWT (plaintext, `tls: false`) to the project's own `falang-<projectId>`
 * namespace; otherwise it is the old tokenless client on the shared namespace. Close `connection` when done.
 */
export const workflowE2eTemporalClient = async (
  projectId: string,
): Promise<{ client: Client; connection: Connection }> => {
  const config = resolveTemporalConfig(process.env);
  if (config.mode === 'shared' || !config.jwt) {
    const connection = await Connection.connect({ address: WORKFLOW_E2E_TEMPORAL_ADDRESS });
    return { client: new Client({ connection, namespace: config.sharedNamespace }), connection };
  }
  const tokens = new TemporalTokenService(config.jwt);
  const connection = await Connection.connect({
    address: WORKFLOW_E2E_TEMPORAL_ADDRESS,
    apiKey: () => tokens.mintAdminToken().token,
    tls: config.tls,
  });
  return { client: new Client({ connection, namespace: temporalNamespaceFor(projectId) }), connection };
};

/** `workflow-dev-<projectId>` / `workflow-<projectId>` → `<projectId>` (see `task-queue-names.ts`). */
const projectIdOfTaskQueue = (taskQueue: string): string =>
  taskQueue.replace(/^workflow-dev-/, '').replace(/^workflow-/, '');

/** Starts the given compiled workflow function on `taskQueue` and awaits its result — mirrors `@falang/workflow-e2e-tests`' `integration-test-helpers.ts` `startAndAwaitResult`. The project (hence its Temporal namespace) is read off the task queue name. */
export const workflowE2eStartAndAwaitResult = async (functionName: string, taskQueue: string): Promise<unknown> => {
  const { client, connection } = await workflowE2eTemporalClient(projectIdOfTaskQueue(taskQueue));
  try {
    const handle = await client.workflow.start(functionName, {
      taskQueue,
      workflowId: `workflow-e2e-${functionName}-${Date.now()}`,
      args: [],
    });
    return await handle.result();
  } finally {
    await connection.close();
  }
};

/** Awaits the result of a workflow already started elsewhere (e.g. a `signalWithStart` triggered by a webhook POST) in `projectId`'s namespace — mirrors `@falang/workflow-e2e-tests`' `integration-test-helpers.ts` `awaitWorkflowResult`. */
export const workflowE2eAwaitWorkflowResult = async (workflowId: string, projectId: string): Promise<unknown> => {
  const { client, connection } = await workflowE2eTemporalClient(projectId);
  try {
    return await client.workflow.getHandle(workflowId).result();
  } finally {
    await connection.close();
  }
};

export interface IWorkflowE2eMockItem {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly createdAt: number;
}

/** Creates an item directly against the ActivePieces mock service, bypassing the piece's own `create_item` action — a real external event a polling trigger must pick up. Mirrors `@falang/workflow-e2e-tests`' `activepieces-mock-helpers.ts` `createMockItemDirectly`. */
export const workflowE2eCreateMockItem = async (title: string, content = ''): Promise<IWorkflowE2eMockItem> => {
  const response = await fetch(`${WORKFLOW_E2E_ACTIVEPIECES_URL}/mock/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-api-key': WORKFLOW_E2E_ACTIVEPIECES_SERVICE_SECRET },
    body: JSON.stringify({ title, content }),
  });
  if (!response.ok) throw new Error(`Failed to create mock item: ${response.status} ${await response.text()}`);
  return (await response.json()) as IWorkflowE2eMockItem;
};

/** Mirrors `@falang/workflow-e2e-tests`' `activepieces-mock-helpers.ts` `fetchMockItems`. */
export const workflowE2eFetchMockItems = async (): Promise<readonly IWorkflowE2eMockItem[]> => {
  const response = await fetch(`${WORKFLOW_E2E_ACTIVEPIECES_URL}/mock/items`, {
    headers: { 'x-internal-api-key': WORKFLOW_E2E_ACTIVEPIECES_SERVICE_SECRET },
  });
  if (!response.ok) throw new Error(`Failed to fetch mock items: ${response.status} ${await response.text()}`);
  return (await response.json()) as readonly IWorkflowE2eMockItem[];
};
