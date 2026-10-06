// oxlint-disable no-undefined -- config parsers: `undefined` is the "not configured" value of the optional manager params.
import type { IRunnerProcessManagerParams } from './runner-process-manager.js';

interface IRunnerEnvCallParams {
  readonly taskQueue: string;
  readonly projectId: string;
  readonly internalProjectToken: string;
  readonly workflowEnv: 'dev' | 'prod';
  readonly temporalAddress?: string;
  readonly namespace?: string;
  readonly buildId?: string;
}

/** Builds a runner pod's env from `RunnerProcessManager`'s process-wide params plus this one `start()` call's own — pulled out of `RunnerProcessManager.start()` to keep that method (and the file's line count) manageable as more optional vendor-specific env vars accumulate. */
export const buildRunnerEnv = (
  managerParams: IRunnerProcessManagerParams,
  callParams: IRunnerEnvCallParams,
): Record<string, string> => {
  const resolvedTemporalAddress = callParams.temporalAddress ?? managerParams.temporalAddress;
  const resolvedNamespace = callParams.namespace ?? managerParams.namespace;

  const env: Record<string, string> = {
    HOME: '/tmp',
    TASK_QUEUE: callParams.taskQueue,
    PROJECT_ID: callParams.projectId,
    INTERNAL_PROJECT_TOKEN: callParams.internalProjectToken,
    WORKFLOW_ENV: callParams.workflowEnv,
  };
  if (resolvedTemporalAddress) env.TEMPORAL_ADDRESS = resolvedTemporalAddress;
  if (resolvedNamespace) env.TEMPORAL_NAMESPACE = resolvedNamespace;
  // ADR 0057 (private): a project's pod only ever talks to its own namespace, with a token it fetches
  // (and refreshes) from `backend`; `shared` mode leaves everything above untouched.
  if (managerParams.tenancy?.mode === 'per-project') {
    env.TEMPORAL_NAMESPACE = managerParams.tenancy.namespaceFor(callParams.projectId);
    env.TEMPORAL_TLS = managerParams.temporalTls ? 'true' : 'false';
    if (managerParams.internalApiUrl) {
      env.TEMPORAL_TOKEN_URL = `${managerParams.internalApiUrl.replace(/\/+$/, '')}/internal/projects/${callParams.projectId}/temporal-token`;
    }
  }
  if (callParams.buildId) {
    env.DEPLOYMENT_NAME = callParams.taskQueue;
    env.BUILD_ID = callParams.buildId;
  }
  if (managerParams.internalApiUrl) env.ARTIFACT_BASE_URL = managerParams.internalApiUrl;
  if (managerParams.internalApiUrl) env.BACKEND_INTERNAL_URL = managerParams.internalApiUrl;
  if (managerParams.activepiecesServiceUrl) env.ACTIVEPIECES_SERVICE_URL = managerParams.activepiecesServiceUrl;
  if (managerParams.telegramApiBaseUrl) env.TELEGRAM_API_BASE_URL = managerParams.telegramApiBaseUrl;
  if (managerParams.mediaServiceUrl) env.MEDIA_SERVICE_URL = managerParams.mediaServiceUrl;
  if (managerParams.backendPublicUrl) env.BACKEND_PUBLIC_URL = managerParams.backendPublicUrl;
  if (managerParams.runnerMetricsPort) env.RUNNER_METRICS_PORT = String(managerParams.runnerMetricsPort);
  if (managerParams.runnerLogFormat) env.LOG_FORMAT = managerParams.runnerLogFormat;
  if (managerParams.coverageEnabled) env.NODE_V8_COVERAGE = '/tmp';
  return env;
};

/** `RUNNER_METRICS_PORT` -> a valid TCP port, else `undefined` (no metrics). */
export const parseRunnerMetricsPort = (raw: string | undefined): number | undefined => {
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : undefined;
};

/** `RUNNER_LOG_FORMAT`/`LOG_FORMAT` -> `json`/`text`, anything else `undefined`. */
export const parseRunnerLogFormat = (raw: string | undefined): 'json' | 'text' | undefined =>
  raw === 'json' || raw === 'text' ? raw : undefined;
