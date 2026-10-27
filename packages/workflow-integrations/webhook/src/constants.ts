export const WEBHOOK_VENDOR = 'webhook';
export const WEBHOOK_TRIGGER_NAME = 'webhook-trigger';
export const WEBHOOK_SIGNAL_NAME = 'webhookRequest';
/** The identifier a compiled `trigger-function` binds the incoming request payload to — see `ITriggerDescriptor.scopeVariableName`. */
export const WEBHOOK_SCOPE_VARIABLE_NAME = 'request';
/** Optional credential field: when set, inbound calls must prove they know it (see `webhook-backend.ts`). */
export const WEBHOOK_SIGNING_SECRET_FIELD = 'signing_secret';
export const WEBHOOK_SECRET_HEADER = 'x-webhook-secret';
export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';
