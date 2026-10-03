import { SQLITE_VENDOR } from '@falang/workflow-integrations-sqlite';

/**
 * The `sqlite` vendor opens a *file path taken from tenant data* inside the backend process (and inside
 * runner pods), so on a multi-tenant deployment it is a file-read primitive. It is therefore off unless
 * the operator opts in with `ENABLE_SQLITE_INTEGRATION=true` (self-host single-tenant, dev, e2e).
 * Off means: not registered (no instances, no sync, no build) and hidden from the client picker.
 */
export const isSqliteIntegrationEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.ENABLE_SQLITE_INTEGRATION === 'true';

/** Vendor ids that exist in the code base but are switched off in this deployment (published via `GET /auth/config`). */
export const getDisabledVendors = (env: NodeJS.ProcessEnv = process.env): string[] =>
  isSqliteIntegrationEnabled(env) ? [] : [SQLITE_VENDOR];
