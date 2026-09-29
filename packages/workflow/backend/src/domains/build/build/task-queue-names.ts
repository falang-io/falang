const DEV_TASK_QUEUE_PREFIX = 'workflow-dev-';

/** Prod task queue = the project's Worker Deployment name — stable across every published version. */
export const prodTaskQueue = (projectId: string): string => `workflow-${projectId}`;
/** Dev task queue — unversioned, single pod, replace-in-place on every `build()`. */
export const devTaskQueue = (projectId: string): string => `workflow-dev-${projectId}`;

/**
 * The inverse of `devTaskQueue` — recovers `projectId` from a dev task queue/deployment name, or
 * `null` if `name` isn't one (e.g. a prod deployment name, `workflow-<projectId>[-<buildId>]`, never
 * matches this prefix). A dev deployment's own name is always its bare task queue (never a
 * `buildId` suffix — see `RunnerProcessManager.start`), so this also works directly on whatever
 * `RunnerProcessManager.stopIdleRunners()` reports as stopped — see ADR 0037 (private) §6 (`RunnerIdleSweepService` forwarding a stopped dev deployment to
 * `IntegrationsRuntimeService.pauseProjectIntegrations`).
 */
export const parseDevTaskQueue = (name: string): string | null =>
  name.startsWith(DEV_TASK_QUEUE_PREFIX) ? name.slice(DEV_TASK_QUEUE_PREFIX.length) : null;
