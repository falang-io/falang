/** Route prefix of the built-in AI provider relay (ADR 0081 (private)); internal port only (`/internal/*`). */
export const AI_PROVIDER_RELAY_PREFIX = 'internal/ai-provider';

/**
 * The `baseUrl` a runner pod gets for an instance on the built-in AI provider:
 * `<BACKEND_INTERNAL_URL>/internal/ai-provider/<projectId>/<env>`. The OpenAI activity code appends
 * `/chat/completions` etc. itself; the environment rides in the path because the pod's call carries nothing else
 * that says which stand it runs on.
 */
export const aiProviderRelayBaseUrl = (internalUrl: string, projectId: string, env: 'dev' | 'prod'): string =>
  `${internalUrl.replace(/\/+$/u, '')}/${AI_PROVIDER_RELAY_PREFIX}/${projectId}/${env}`;
