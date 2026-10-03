export interface IRunnerConfig {
  /** Reachable from inside the k8s cluster — see `fetch-artifact.ts`. */
  readonly artifactBaseUrl: string;
  readonly projectId: string;
  readonly internalProjectToken: string;
  /** Unique per workflow definition/version — see ADR 0002 (private). */
  readonly taskQueue: string;
  readonly temporalAddress?: string;
  readonly namespace?: string;
  /**
   * Where to fetch (and every half-TTL refresh) this pod's Temporal JWT from — set by `backend` only in
   * `per-project` tenant-isolation mode (ADR 0057 (private)); absent = the pre-isolation tokenless connection.
   */
  readonly temporalTokenUrl?: string;
  /** `TEMPORAL_TLS` — `undefined` when not set (the SDK default applies: no TLS without a token). With a token the SDK would turn TLS on by itself, so `start-runner.ts` pins `tls: false` unless this is `true`. */
  readonly temporalTls?: boolean;
  /** Worker Deployment name (see ADR 0004 (private)) — set together with `buildId`, or omitted for the unversioned dev pod. */
  readonly deploymentName?: string;
  /** Worker Deployment version's build ID — set together with `deploymentName`; also selects the published-version artifact endpoint over the dev one, see `fetch-artifact.ts`. */
  readonly buildId?: string;
  /** `backend`'s in-cluster URL (egress proxy config, ADR 0056 (private)); egress routing is skipped when unset. */
  readonly backendUrl?: string;
  /** Sibling services whose origins are never routed through an egress proxy. */
  readonly internalServiceUrls?: readonly string[];
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
    temporalTokenUrl: env.TEMPORAL_TOKEN_URL,
    ...(env.TEMPORAL_TLS ? { temporalTls: env.TEMPORAL_TLS === 'true' } : {}),
    deploymentName: env.DEPLOYMENT_NAME,
    buildId: env.BUILD_ID,
    backendUrl: env.BACKEND_INTERNAL_URL,
    internalServiceUrls: [env.ACTIVEPIECES_SERVICE_URL, env.MEDIA_SERVICE_URL].filter(
      (url): url is string => typeof url === 'string' && url !== '',
    ),
  };
};
