import type { TRegisterIntegrationBackend } from '@falang/workflow-integrations-common';

/**
 * A no-op ingress. The host only creates the implicit credential-less (project, env) target — which table
 * triggers are delivered through — for a vendor that has a `registerBackend` (ADR 0075 (private) plan finding 8);
 * the change dispatcher (T6) finds that target and signals it, so there is nothing to subscribe to here.
 */
export const registerTablesBackend: TRegisterIntegrationBackend = () => Promise.resolve(() => Promise.resolve());
