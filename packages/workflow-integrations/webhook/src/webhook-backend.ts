import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import {
  constantTimeEqual,
  type IIntegrationBackendContext,
  type IIntegrationDocumentRecord,
  type TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import {
  WEBHOOK_SECRET_HEADER,
  WEBHOOK_SIGNAL_NAME,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_VERSION_FIELD,
  isWebhookSignatureRequired,
  parseWebhookSignatureVersion,
  webhookSecretLabel,
} from './constants.js';

interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
  readonly triggerConfig?: Readonly<Record<string, string>>;
}

interface IWebhookRequestPayload {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** `trigger-function`'s childTuple is `[function-header, trigger-function-body, function-footer]` — see `@falang/workflow-dto`. */
const getTriggerFunctionBodyData = (doc: IIntegrationDocumentRecord): ITriggerFunctionBodyData | undefined => {
  const body = doc.root?.children?.[1];
  if (body?.name !== TRIGGER_FUNCTION_BODY_NAME) return;
  return body.data as ITriggerFunctionBodyData;
};

const findBoundTriggerFunctions = async (
  ctx: IIntegrationBackendContext,
): Promise<readonly IIntegrationDocumentRecord[]> => {
  const triggerFunctionDocuments = await ctx.getDocumentsByType(TRIGGER_FUNCTION_NAME);
  return triggerFunctionDocuments.filter((doc) => {
    const body = getTriggerFunctionBodyData(doc);
    return body?.vendor === ctx.vendor && body.credentialId === ctx.credentialId;
  });
};

/** The shared-secret header is never handed to the workflow (it would land in Temporal history and the run journal). */
const buildRequestPayload = (request: Request, body: string): IWebhookRequestPayload => {
  const headers = Object.fromEntries([...request.headers.entries()].filter(([name]) => name !== WEBHOOK_SECRET_HEADER));
  return { method: request.method, headers, body };
};

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Hex HMAC-SHA256 of the raw body (Web Crypto — a global in Node and browsers, no `node:*` import in this browser-reachable package). */
const hmacSha256Hex = async (secret: string, body: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
};

/**
 * A request is accepted iff it carries either `X-Webhook-Signature: sha256=<hex HMAC of the raw body>` or
 * `X-Webhook-Secret: <the secret>`; both compared in constant time. `secret === null` means no signature is required.
 */
const isAuthorized = async (secret: string | null, request: Request, body: string): Promise<boolean> => {
  if (secret === null) return true;
  const sharedSecret = request.headers.get(WEBHOOK_SECRET_HEADER);
  if (sharedSecret !== null && constantTimeEqual(sharedSecret, secret)) return true;
  const signature = request.headers.get(WEBHOOK_SIGNATURE_HEADER);
  if (signature === null) return false;
  const expected = `sha256=${await hmacSha256Hex(secret, body)}`;
  return constantTimeEqual(signature.trim().toLowerCase(), expected);
};

/** The trigger's derived secret, or `''` (= reject every call) when the host cannot derive one. */
const deriveSigningSecret = (
  ctx: IIntegrationBackendContext,
  triggerDocumentId: string,
  triggerConfig: Readonly<Record<string, string>> | undefined,
): string => {
  const version = parseWebhookSignatureVersion(triggerConfig?.[WEBHOOK_SIGNATURE_VERSION_FIELD]);
  try {
    return ctx.deriveSecret?.(webhookSecretLabel(triggerDocumentId, version)) ?? '';
  } catch {
    return '';
  }
};

const readCurrentTriggerConfig = async (
  ctx: IIntegrationBackendContext,
  triggerDocumentId: string,
  fallback: Readonly<Record<string, string>> | undefined,
): Promise<Readonly<Record<string, string>> | undefined> => {
  try {
    const bound = await findBoundTriggerFunctions(ctx);
    const document = bound.find((candidate) => candidate.id === triggerDocumentId);
    return document ? getTriggerFunctionBodyData(document)?.triggerConfig : fallback;
  } catch {
    return fallback;
  }
};

// oxlint-disable-next-line no-empty-function -- nothing to unregister remotely, no third-party service was ever told about this route.
const noopDispose = async (): Promise<void> => {};

/**
 * Unlike `registerTelegramBackend` (which picks webhook-vs-poll based on `ctx.webhookUrl`), a generic
 * inbound webhook has no third-party service to notify of its own URL and no meaningful "poll"
 * fallback — nothing to poll, requests only ever arrive pushed. So this ignores `ctx.webhookUrl`
 * entirely and always registers one local route per bound `trigger-function`: `ctx.registerWebHook`
 * works regardless of public-host mode (see `IntegrationsRuntimeService`'s `startTarget` — it just adds
 * an entry to the host's local route table), reachable at `/webhooks/webhook/:projectId/:credentialId/:env/:uri`
 * whether or not that's *externally* reachable — fine for `curl`-driven local testing, and for real
 * external callers once a public host is configured.
 *
 * `uri` is the trigger-function's own document id, so several trigger-functions can share one
 * credential instance while each getting a distinct URL — unlike Telegram, where routing between
 * several bound trigger-functions happens *inside* one shared handler (keyed by chat/command); here
 * it's one handler per trigger-function from the start, so no such routing is needed.
 *
 * Known limitation: the bound trigger-function list is read once, when this target starts (see
 * `IntegrationsRuntimeService.discoverTarget` — `registerBackend` isn't re-invoked for an already-active
 * target). A trigger-function added after that won't get a route until the project's dev/prod ingress
 * is stopped and resumed (e.g. Build & Run again) — same class of staleness the rest of the discovery
 * loop already has for newly-configured credentials.
 */
export const registerWebhookBackend: TRegisterIntegrationBackend = async (ctx) => {
  const triggerFunctions = await findBoundTriggerFunctions(ctx);
  for (const triggerFunction of triggerFunctions) {
    // The signature settings are re-read from the document on every call so that switching `require_signature` on or
    // rotating `signature_version` takes effect at once (the route list itself is still fixed at registration, see the
    // known limitation above); the registration-time config is the fallback if that lookup fails. The secret is derived
    // on the server (never stored in the document); a host that cannot derive one fails closed.
    const registeredConfig = getTriggerFunctionBodyData(triggerFunction)?.triggerConfig;
    ctx.registerWebHook(triggerFunction.id, async (request) => {
      const body = await request.text();
      const triggerConfig = await readCurrentTriggerConfig(ctx, triggerFunction.id, registeredConfig);
      const signingSecret = isWebhookSignatureRequired(triggerConfig)
        ? deriveSigningSecret(ctx, triggerFunction.id, triggerConfig)
        : null;
      if (signingSecret === '' || !(await isAuthorized(signingSecret, request, body))) {
        return new Response(null, { status: 401 });
      }
      const payload = buildRequestPayload(request, body);
      await ctx.signalWorkflow({
        workflowId: `webhook-${triggerFunction.id}`,
        workflowType: triggerFunction.name,
        signalName: WEBHOOK_SIGNAL_NAME,
        signalArgs: [payload],
      });
      return new Response(null, { status: 200 });
    });
  }
  return noopDispose;
};
