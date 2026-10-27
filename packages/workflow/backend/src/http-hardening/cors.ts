import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

/** Origins from `CORS_ORIGINS` (comma-separated), else the origin of `CLIENT_PUBLIC_URL`; `null` = not restricted. */
export const resolveCorsOrigins = (env: NodeJS.ProcessEnv): string[] | null => {
  const explicit = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter((entry) => entry.length > 0);
  if (explicit.length > 0) return explicit;
  const client = env.CLIENT_PUBLIC_URL?.trim();
  if (client) {
    try {
      return [new URL(client).origin];
    } catch {
      return null;
    }
  }
  return null;
};

let warned = false;

/** CORS options for `app.enableCors`: restricted to the allowed origins, or (dev/self-host) permissive with one warning. */
export const buildCorsOptions = (env: NodeJS.ProcessEnv, warn: (message: string) => void): CorsOptions => {
  const origins = resolveCorsOrigins(env);
  if (!origins) {
    if (!warned) {
      warned = true;
      warn('Neither CORS_ORIGINS nor CLIENT_PUBLIC_URL is set: CORS is open to every origin.');
    }
    return {};
  }
  return { origin: origins };
};
