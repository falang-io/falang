import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import type { OAuthCredentialsService } from '../admin/oauth-credentials/oauth-credentials.service.js';
import { resolveFieldValue } from './credentials-codec.js';

/**
 * See ADR 0030 (private): the platform's own
 * `oauth_credentials` row for `integration.vendor` wins when one exists; otherwise falls back to
 * the instance's own `client_id`/`client_secret` fields (native vendors — amoCRM, Diadoc — whose
 * `credentialFields` still declare them, unchanged). ActivePieces OAuth2 pieces never declare these
 * fields any more (see `ActivepiecesCatalogService.getDynamicIntegrations`), so a piece with no
 * platform row simply resolves to `null` here — the "disabled" behavior the ADR intends.
 */
export const resolveOAuth2ClientCredentials = async (
  oauthCredentials: OAuthCredentialsService,
  integration: IWorkflowIntegration,
  instance: IIntegrationInstance,
  env: 'dev' | 'prod',
  encryptionKey: Buffer,
): Promise<{ clientId: string; clientSecret: string } | null> => {
  const platform = await oauthCredentials.resolve(integration.vendor);
  if (platform) return platform;
  // A platform-client vendor (amoCRM) never falls back to the instance: its keys exist only in the admin app.
  if (integration.oauth2?.platformClient) return null;

  const clientIdField = integration.credentialFields.find((field) => field.name === 'client_id');
  const clientSecretField = integration.credentialFields.find((field) => field.name === 'client_secret');
  const clientId = clientIdField && resolveFieldValue(instance, clientIdField, env, encryptionKey);
  const clientSecret = clientSecretField && resolveFieldValue(instance, clientSecretField, env, encryptionKey);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
};
