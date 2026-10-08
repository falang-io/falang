import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { REGISTERED_INTEGRATIONS } from './registered-integrations.js';

/**
 * Statically registered vendors whose OAuth2 client is the platform's own (`oauth2.platformClient`,
 * e.g. amoCRM) — configured on the admin app's "OAuth credentials" page next to ActivePieces OAuth2
 * pieces (ADR 0030 (private)).
 */
export const getPlatformClientIntegrations = (
  integrations: readonly IWorkflowIntegration[] = REGISTERED_INTEGRATIONS,
): IWorkflowIntegration[] => integrations.filter((integration) => integration.oauth2?.platformClient === true);

/**
 * Platform-client vendors with no `oauth_credentials` row yet — published in `GET /auth/config`'s
 * `disabledVendors` so the editor and the agents hide them until an admin has entered the keys.
 * Existing instances of such a vendor are kept (the vendor stays registered for encode/compile).
 */
export const getUnconfiguredPlatformClientVendors = async (
  oauthCredentials: { listConfiguredVendors(): Promise<ReadonlySet<string>> },
  integrations: readonly IWorkflowIntegration[] = REGISTERED_INTEGRATIONS,
): Promise<string[]> => {
  const platformVendors = getPlatformClientIntegrations(integrations).map((integration) => integration.vendor);
  if (platformVendors.length === 0) return [];
  const configured = await oauthCredentials.listConfiguredVendors();
  return platformVendors.filter((vendor) => !configured.has(vendor));
};
