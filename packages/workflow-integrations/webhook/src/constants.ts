export const WEBHOOK_VENDOR = 'webhook';
export const WEBHOOK_TRIGGER_NAME = 'webhook-trigger';
export const WEBHOOK_SIGNAL_NAME = 'webhookRequest';
/** The identifier a compiled `trigger-function` binds the incoming request payload to — see `ITriggerDescriptor.scopeVariableName`. */
export const WEBHOOK_SCOPE_VARIABLE_NAME = 'request';
/** Trigger config (`'true'` | `'false'`, default off): inbound calls must prove they know the derived secret (see `webhook-backend.ts`). */
export const WEBHOOK_REQUIRE_SIGNATURE_FIELD = 'require_signature';
/** Trigger config (positive integer, default 1): part of the derived secret's label — raising it rotates the secret. */
export const WEBHOOK_SIGNATURE_VERSION_FIELD = 'signature_version';
export const WEBHOOK_SECRET_HEADER = 'x-webhook-secret';
export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

/**
 * The `ctx.deriveSecret()` label of a webhook trigger's secret: unique per trigger-function document and rotation version.
 * The backend's "show the secret" route derives the same label, so keep this the single definition.
 */
export const webhookSecretLabel = (triggerDocumentId: string, version: number): string =>
  `webhook-trigger:${triggerDocumentId}:v${version}`;

/** The `signature_version` of a trigger config: a positive integer, anything blank/invalid reads as 1. */
export const parseWebhookSignatureVersion = (value: string | undefined): number => {
  const parsed = Number(value?.trim());
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
};

/** Whether a trigger config asks for signed calls. */
export const isWebhookSignatureRequired = (triggerConfig: Readonly<Record<string, string>> | undefined): boolean =>
  triggerConfig?.[WEBHOOK_REQUIRE_SIGNATURE_FIELD] === 'true';
