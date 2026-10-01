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
  if (managerParams.coverageEnabled) env.NODE_V8_COVERAGE = '/tmp';
  return env;
};
