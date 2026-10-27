import { createHmac } from 'node:crypto';

export interface IDeriveIntegrationSecretParams {
  /** Server-side key (`resolveWebhookSecretKey`). */
  readonly key: string;
  readonly projectId: string;
  readonly credentialId: string;
  readonly env: string;
  readonly vendor: string;
  /** Names what the secret protects, e.g. `webhook-trigger:<documentId>:v1`. */
  readonly label: string;
}

/**
 * The one definition of `ctx.deriveSecret(label)`: HMAC-SHA256 (base64url) of the target's identity and the label under a
 * server-side key. Shared by the runtime (`IntegrationsRuntimeService`) and by anything that must show the same secret to a
 * user (e.g. the backend's webhook-secret route), so the two can never drift apart.
 */
export const deriveIntegrationSecret = (params: IDeriveIntegrationSecretParams): string =>
  createHmac('sha256', params.key)
    .update(
      ['falang-webhook-secret', params.projectId, params.credentialId, params.env, params.vendor, params.label].join(
        '\n',
      ),
    )
    .digest('base64url');
