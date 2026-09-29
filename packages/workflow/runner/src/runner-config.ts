export interface IRunnerConfig {
  /** Reachable from inside the k8s cluster — see `fetch-artifact.ts`. */
  readonly artifactBaseUrl: string;
  readonly projectId: string;
  readonly internalProjectToken: string;
  /** Unique per workflow definition/version — see ADR 0002 (private). */
  readonly taskQueue: string;
  readonly temporalAddress?: string;
  readonly namespace?: string;
  /** Worker Deployment name (see ADR 0004 (private)) — set together with `buildId`, or omitted for the unversioned dev pod. */
  readonly deploymentName?: string;
  /** Worker Deployment version's build ID — set together with `deploymentName`; also selects the published-version artifact endpoint over the dev one, see `fetch-artifact.ts`. */
  readonly buildId?: string;
}

const REQUIRED_ENV_VARS = ['ARTIFACT_BASE_URL', 'PROJECT_ID', 'INTERNAL_PROJECT_TOKEN', 'TASK_QUEUE'] as const;

/**
 * Reads the config for a single runner pod from the environment — set by `RunnerProcessManager`
 * on the pod's container spec (see ADR 0016 (private)'s Phase 2).
 * Each pod backs exactly one workflow definition/version, so it's configured entirely through env
 * vars rather than a config file — there's nothing to share between runner pods.
 */
export const readRunnerConfigFromEnv = (env: NodeJS.ProcessEnv = process.env): IRunnerConfig => {
  const missing = REQUIRED_ENV_VARS.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }

  return {
    artifactBaseUrl: env.ARTIFACT_BASE_URL as string,
    projectId: env.PROJECT_ID as string,
    internalProjectToken: env.INTERNAL_PROJECT_TOKEN as string,
    taskQueue: env.TASK_QUEUE as string,
    temporalAddress: env.TEMPORAL_ADDRESS,
    namespace: env.TEMPORAL_NAMESPACE,
    deploymentName: env.DEPLOYMENT_NAME,
    buildId: env.BUILD_ID,
  };
};
