import { REGISTERED_INTEGRATIONS } from './integrations-registry.js';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';

/**
 * Integration vendors the deployment switched off (`GET /auth/config` → `disabledVendors`, e.g. `sqlite` unless
 * `ENABLE_SQLITE_INTEGRATION=true`). One shared, once-per-page-load cache used by the editor's vendor pickers
 * (`useDisabledVendors`) and the in-app agent's tools alike; `[]` until loaded or if the fetch fails (the backend
 * rejects a disabled vendor anyway).
 */
let disabledVendors: readonly string[] = [];
let loading: Promise<readonly string[]> | null = null;

export const getDisabledVendors = (): readonly string[] => disabledVendors;

/** Test seam / manual override. */
export const setDisabledVendors = (vendors: readonly string[]): void => {
  disabledVendors = vendors;
};

/** Fetches `/auth/config` at most once (a failed fetch may be retried by the next call). */
export const loadDisabledVendors = (): Promise<readonly string[]> => {
  // Imported lazily: `api-client.ts` reads `localStorage` at module scope, which a plain-node consumer (the agent
  // tool providers' unit tests) doesn't have.
  loading ??= import('./api-client.js')
    .then(({ workflowApi }) => workflowApi.authConfig())
    .then((config) => {
      disabledVendors = config.disabledVendors ?? [];
      return disabledVendors;
    })
    .catch(() => {
      loading = null;
      return disabledVendors;
    });
  return loading;
};

/** `REGISTERED_INTEGRATIONS` minus the vendors this deployment disabled. */
export const getEnabledIntegrations = (): readonly IWorkflowIntegration[] =>
  REGISTERED_INTEGRATIONS.filter((item) => !disabledVendors.includes(item.vendor));
