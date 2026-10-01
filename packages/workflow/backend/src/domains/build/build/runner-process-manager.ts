// oxlint-disable max-lines -- grew past 300 lines from ADR 0041 (private)'s `mediaServiceUrl` doc
// comment; a handful of lines, not accumulated complexity.
import type { V1Deployment } from '@kubernetes/client-node';
import type { IK8sDeploymentsClient } from './k8s-deployments-client.js';
import { buildRunnerEnv } from './runner-env.js';

const APP_LABEL = 'app.kubernetes.io/name';
const APP_LABEL_VALUE = 'workflow-runner';
const PROJECT_ID_LABEL = 'falang.dev/project-id';
const TASK_QUEUE_LABEL = 'falang.dev/task-queue';
const ENV_LABEL = 'falang.dev/env';
const DEPLOYMENT_KEY_LABEL = 'falang.dev/deployment-key';

export interface IRunnerProcessManagerParams {
  readonly deploymentsClient: IK8sDeploymentsClient;
  /** k8s namespace runner Deployments are created in — distinct from Temporal's own `namespace` concept below. */
  readonly k8sNamespace: string;
  /** Shared runner pod image — see ADR 0016 (private)'s "Artifact delivery into the runner pod" (one image for every project/version, artifact fetched at pod start). */
  readonly runnerImage: string;
  /** `serviceAccountName` for runner pods (`RUNNER_SERVICE_ACCOUNT`). Unset = the namespace default. A runner never gets a mounted API token either way. */
  readonly runnerServiceAccount?: string;
  /** Fallback Temporal connection settings applied when `start()` doesn't override them — e.g. the address `backend` itself was configured with. */
  readonly temporalAddress?: string;
  readonly namespace?: string;
  /**
   * Base URL a runner pod fetches its artifact from (`internal-artifacts.controller.ts`) and, at
   * activity-execution time, resolves credentials against (`internal/credentials/resolve` — see
   * ADR 0006's "internal resolver" follow-up) — must be reachable from inside the k8s cluster
   * (a cluster-internal Service DNS name in a real cluster; a docker-network-reachable host address
   * for local `kind`), not `localhost`, unlike when `runner` was a same-host child process.
   */
  readonly internalApiUrl?: string;
  /**
   * How a runner pod's compiled `activepieces-*` action activities (e.g.
   * `activepiecesResendSendEmail`) reach the standalone `falang-workflow-activepieces` service —
   * see ADR 0010 (private). Same process-wide, no per-`start()` override, as `internalApiUrl` above.
   */
  readonly activepiecesServiceUrl?: string;
  /**
   * How a runner pod's compiled Telegram activities (e.g. `telegramSendMessage`) reach the
   * Telegram Bot API — see `packages/workflow-integrations/telegram/src/telegram.integration.ts`'s
   * generated `TELEGRAM_API_BASE_URL` fallback. Same process-wide, no per-`start()` override, as
   * `internalApiUrl`/`activepiecesServiceUrl` above. Unset in production (falls back to the real
   * `https://api.telegram.org`); the e2e stack points this at `@falang/workflow-mocks`'s Telegram
   * mock — pods can't resolve that service by its docker-internal name any more than `backend`'s.
   */
  readonly telegramApiBaseUrl?: string;
  /**
   * How a runner pod's compiled `media-*` action activities (e.g. `mediaImageResize`) reach the
   * standalone `@falang/workflow-media` service — see ADR 0041 (private).
   * Same process-wide, no per-`start()` override, as `internalApiUrl`/`activepiecesServiceUrl`/
   * `telegramApiBaseUrl` above; `RUNNER_MEDIA_SERVICE_URL` overrides `MEDIA_SERVICE_URL` for pods
   * specifically, same reasoning as those (a pod can't resolve the service's docker-internal name
   * on local `kind`).
   */
  readonly mediaServiceUrl?: string;
  /**
   * The public URL vendors redirect back to on `/oauth2/callback/:vendor` — needed by a runner pod's
   * OAuth2 refresh activity (`resolveOAuth2AccessToken`) for vendors whose refresh grant also
   * validates `redirect_uri` (`IOAuth2Config.includeRedirectUriOnRefresh`, e.g. amoCRM; see
   * ADR 0017 (private)). Not a connection target like `internalApiUrl`/`temporalAddress` — a literal
   * string the vendor compares against what it has on file — so no `RUNNER_*`-prefixed override.
   */
  readonly backendPublicUrl?: string;
  /** From `backend`'s own `NODE_V8_COVERAGE` presence (`build.module.ts`) — sets pods' `NODE_V8_COVERAGE=/tmp` so `runner`'s `main.ts` pushes its coverage on `SIGTERM` (ADR 0016's "Runner-pod coverage collection"). */
  readonly coverageEnabled?: boolean;
}

/** One currently-running runner Deployment, as reported by `RunnerProcessManager.listRunning()`. */
export interface IRunningRunner {
  readonly deploymentName: string;
  readonly taskQueue: string;
  /** Absent for the unversioned dev deployment (`deploymentName === taskQueue`). */
  readonly buildId?: string;
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
}

export interface IStartRunnerParams {
  readonly taskQueue: string;
  /** So the pod can fetch its own artifact and resolve credentials scoped to this project — see `internal-artifacts.controller.ts`/`ProjectTokenGuard`. */
  readonly projectId: string;
  /** Per-project scoped internal-API token — see `ProjectTokenService`. */
  readonly internalProjectToken: string;
  readonly temporalAddress?: string;
  readonly namespace?: string;
  /**
   * Worker Deployment build ID (see ADR 0004 (private)). Omitted
   * for the unversioned dev queue (single pod, replace-in-place on every `start()`). When set, the
   * Temporal Worker Deployment name is always the task queue name, and this version's pod runs
   * alongside — not instead of — any other versions already running on the same task queue.
   */
  readonly buildId?: string;
  /** Which credential env this runner's activities resolve secrets against — see ADR 0006's "Dev/prod credential separation". `build()` passes `'dev'`; `publish()`/`activate()` pass `'prod'`. */
  readonly workflowEnv: 'dev' | 'prod';
}

/** k8s object names must be a DNS-1123 label — `taskQueue`/`buildId` are already lowercase-and-hyphens (`workflow[-dev]-<uuid>`, `v<n>`), so this is just concatenation, not real sanitization. */
const deploymentNameFor = (taskQueue: string, buildId?: string): string => (buildId ? `${taskQueue}-${buildId}` : taskQueue);

const taskQueueSelector = (taskQueue: string): string => `${TASK_QUEUE_LABEL}=${taskQueue}`;

/**
 * Owns the lifecycle of runner pods — one k8s `Deployment` per workflow definition/version, on its
 * own Temporal task queue (see ADR 0002 (private) and, for why this
 * moved off `child_process.spawn`, ADR 0016 (private)'s Phase 2). No
 * artifact is ever written to the pod's filesystem or passed via a file path — the pod fetches its
 * compiled code over HTTP and loads it in memory at startup (`@falang/workflow-runner`'s
 * `start-runner.ts`), which is what lets its Pod spec set `readOnlyRootFilesystem: true`.
 *
 * Deployments are keyed by `(taskQueue, buildId)`, not just `taskQueue`: the unversioned dev queue
 * has one pod per task queue (replace-in-place), but a published (prod) task queue can have several
 * published versions' pods polling it concurrently (see ADR 0004 (private)) — starting one version
 * must not remove another.
 */
export class RunnerProcessManager {
  private readonly params: IRunnerProcessManagerParams;
  /**
   * Last-activity timestamp per key, backing `stopIdleRunners()` (see ADR 0016 (private)'s Phase 2
   * "Scale-to-zero" follow-up) — keyed by either a deployment's own name (touched on `start()`) or
   * its bare `taskQueue` (touched by manual runs and trigger signals, which don't know which specific
   * `buildId` Temporal's worker versioning will actually route to). In-memory only, same MVP-scope
   * choice as `DevArtifactStore`/`ProjectTokenService` — lost on a `backend` restart, which just
   * means every currently-running deployment gets one fresh grace period (see `stopIdleRunners`).
   */
  private readonly lastActivity = new Map<string, number>();

  constructor(params: IRunnerProcessManagerParams) {
    this.params = params;
  }

  /** Records activity for `key` (a deployment name or a bare task queue) — see `lastActivity`'s doc comment. */
  touch(key: string): void {
    this.lastActivity.set(key, Date.now());
  }

  async start({
    taskQueue,
    projectId,
    internalProjectToken,
    temporalAddress,
    namespace,
    buildId,
    workflowEnv,
  }: IStartRunnerParams): Promise<void> {
    const name = deploymentNameFor(taskQueue, buildId);
    const env = buildRunnerEnv(this.params, {
      taskQueue,
      projectId,
      internalProjectToken,
      workflowEnv,
      temporalAddress,
      namespace,
      buildId,
    });

    await this.params.deploymentsClient.apply(this.params.k8sNamespace, this.buildDeployment(name, taskQueue, projectId, workflowEnv, env));
    this.touch(name);
  }

  async stop(taskQueue: string): Promise<void> {
    const name = deploymentNameFor(taskQueue);
    await this.params.deploymentsClient.delete(this.params.k8sNamespace, name);
    this.lastActivity.delete(name);
  }

  /** Explicitly retires one published version's runner pod, leaving other versions on the same task queue untouched. */
  async stopVersion(taskQueue: string, buildId: string): Promise<void> {
    const name = deploymentNameFor(taskQueue, buildId);
    await this.params.deploymentsClient.delete(this.params.k8sNamespace, name);
    this.lastActivity.delete(name);
  }

  isRunning(taskQueue: string, buildId?: string): Promise<boolean> {
    return this.params.deploymentsClient.exists(this.params.k8sNamespace, deploymentNameFor(taskQueue, buildId));
  }

  /** Whether any version has a live pod on `taskQueue` — used to gate prod-only behavior (e.g. `publish()` only auto-starting a new version if prod is already running) on the task queue as a whole, not one specific version. */
  async isAnyRunning(taskQueue: string): Promise<boolean> {
    const names = await this.params.deploymentsClient.listNames(this.params.k8sNamespace, taskQueueSelector(taskQueue));
    return names.length > 0;
  }

  /** How many versions currently have a live pod on `taskQueue` — backs `BuildService`'s per-project cap on concurrently-running published versions (see ADR 0016 (private)'s "Per-tenant ResourceQuota" follow-up). */
  async countRunning(taskQueue: string): Promise<number> {
    const names = await this.params.deploymentsClient.listNames(this.params.k8sNamespace, taskQueueSelector(taskQueue));
    return names.length;
  }

  /** Stops every version currently running on `taskQueue` — the counterpart to `start()`'s per-version model, for a project-wide "stop prod" action. */
  async stopAll(taskQueue: string): Promise<void> {
    const names = await this.params.deploymentsClient.listNames(this.params.k8sNamespace, taskQueueSelector(taskQueue));
    await Promise.all(names.map((name) => this.params.deploymentsClient.delete(this.params.k8sNamespace, name)));
    for (const name of names) this.lastActivity.delete(name);
  }

  /**
   * Stops every runner pod this manager's namespace holds, regardless of task queue — used for
   * whole-stack teardown (e.g. test cleanup). Unlike the pre-k8s child-process version of this
   * method, this has no relationship to `backend`'s own shutdown/coverage-flush ordering (see
   * `main.ts`'s `registerCoverageShutdownHook`): a runner pod is a wholly separate k8s object with
   * its own lifecycle, not a child process torn down when `backend`'s own process exits.
   */
  async stopEverything(): Promise<void> {
    const names = await this.params.deploymentsClient.listNames(this.params.k8sNamespace, `${APP_LABEL}=${APP_LABEL_VALUE}`);
    await Promise.all(names.map((name) => this.params.deploymentsClient.delete(this.params.k8sNamespace, name)));
    for (const name of names) this.lastActivity.delete(name);
  }

  /** Every runner Deployment this manager's namespace currently holds, with the identifying labels `buildDeployment()` sets — backs `stopIdleRunners()`. */
  async listRunning(): Promise<readonly IRunningRunner[]> {
    const deployments = await this.params.deploymentsClient.listAll(this.params.k8sNamespace, `${APP_LABEL}=${APP_LABEL_VALUE}`);
    const runners: IRunningRunner[] = [];
    for (const deployment of deployments) {
      const taskQueue = deployment.labels[TASK_QUEUE_LABEL];
      const projectId = deployment.labels[PROJECT_ID_LABEL];
      const env = deployment.labels[ENV_LABEL];
      if (!taskQueue || !projectId || (env !== 'dev' && env !== 'prod')) continue;
      runners.push(
        deployment.name === taskQueue
          ? { deploymentName: deployment.name, taskQueue, projectId, env }
          : { deploymentName: deployment.name, taskQueue, buildId: deployment.name.slice(taskQueue.length + 1), projectId, env },
      );
    }
    return runners;
  }

  /**
   * Stops every runner Deployment idle for at least `idleTimeoutMs` — see ADR 0016 (private)'s
   * Phase 2 "Scale-to-zero" follow-up (a deliberate app-level sweep instead of KEDA, matching the
   * "app-level check on the receiving side" reasoning the ADR's `NetworkPolicy`/per-project-token
   * sections already use). Idleness is judged against whichever is more recent: activity touched on
   * this exact deployment (its own `start()` call) or on its bare `taskQueue` (a manual run or
   * trigger signal, which only know the task queue, not which `buildId` is currently serving it — see
   * `BuildService.ensureRunnerRunning`). A deployment `touch()` has never recorded — e.g. one still
   * running from before this `backend` process last restarted — gets a fresh baseline instead of
   * being stopped on first sight, so a restart doesn't mass-evict everything that happens to be idle
   * at that moment before the next real activity would have touched it anyway.
   */
  async stopIdleRunners(idleTimeoutMs: number, now = Date.now()): Promise<readonly string[]> {
    const running = await this.listRunning();
    const toStop: string[] = [];
    for (const runner of running) {
      const hasActivity = this.lastActivity.has(runner.deploymentName) || this.lastActivity.has(runner.taskQueue);
      if (!hasActivity) {
        this.touch(runner.deploymentName);
        continue;
      }
      const last = Math.max(this.lastActivity.get(runner.deploymentName) ?? 0, this.lastActivity.get(runner.taskQueue) ?? 0);
      if (now - last >= idleTimeoutMs) toStop.push(runner.deploymentName);
    }
    await Promise.all(toStop.map((name) => this.params.deploymentsClient.delete(this.params.k8sNamespace, name)));
    for (const name of toStop) this.lastActivity.delete(name);
    return toStop;
  }

  private buildDeployment(
    name: string,
    taskQueue: string,
    projectId: string,
    workflowEnv: 'dev' | 'prod',
    env: Record<string, string>,
  ): V1Deployment {
    const labels = {
      [APP_LABEL]: APP_LABEL_VALUE,
      [PROJECT_ID_LABEL]: projectId,
      [TASK_QUEUE_LABEL]: taskQueue,
      [ENV_LABEL]: workflowEnv,
      [DEPLOYMENT_KEY_LABEL]: name,
    };

    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name, labels },
      spec: {
        replicas: 1,
        selector: { matchLabels: { [DEPLOYMENT_KEY_LABEL]: name } },
        template: {
          metadata: { labels },
          spec: {
            // A runner runs user-authored code: it must never hold a Kubernetes API credential, nor see
            // every Service of the namespace as env vars (security audit 2026-10-01, P0-2).
            automountServiceAccountToken: false,
            enableServiceLinks: false,
            ...(this.params.runnerServiceAccount ? { serviceAccountName: this.params.runnerServiceAccount } : {}),
            // No artifact/secret ever lands on this pod's own filesystem (see the class doc
            // comment) — a hostile workflow gains nothing from write access to it.
            securityContext: { runAsNonRoot: true, runAsUser: 1000, seccompProfile: { type: 'RuntimeDefault' } },
            containers: [
              {
                name: 'runner',
                image: this.params.runnerImage,
                env: Object.entries(env).map(([envName, value]) => ({ name: envName, value })),
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem: true,
                  capabilities: { drop: ['ALL'] },
                },
                volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }],
              },
            ],
            volumes: [{ name: 'tmp', emptyDir: {} }],
          },
        },
      },
    };
  }
}
