import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type {
  IIntegrationBackendContext,
  IIntegrationDocumentRecord,
  TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import { extractAmoCrmEvents, parseAmoCrmFormBody, readAmoCrmAccount } from './amocrm-webhook-payload.js';
import {
  AMOCRM_TRIGGER_EVENT_FIELD,
  AMOCRM_WEBHOOK_SIGNAL_NAME,
  AMOCRM_WEBHOOK_TRIGGER_SPECS,
  type IAmoCrmWebhookTriggerSpec,
} from './amocrm-webhook-triggers.js';

interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
  readonly triggerConfig?: Readonly<Record<string, string>>;
}

export interface IAmoCrmTriggerBinding {
  readonly triggerFunction: IIntegrationDocumentRecord;
  readonly spec: IAmoCrmWebhookTriggerSpec;
  readonly eventValue: string;
  readonly setting: string;
}

/** amoCRM expects an answer within 2 seconds, otherwise the delivery counts as failed and is retried. */
const RESPONSE_BUDGET_MS = 1500;
const MAX_BODY_BYTES = 1024 * 1024;

const getBodyData = (doc: IIntegrationDocumentRecord): ITriggerFunctionBodyData | undefined => {
  const body = doc.root?.children?.[1];
  if (body?.name !== TRIGGER_FUNCTION_BODY_NAME) return;
  return body.data as ITriggerFunctionBodyData;
};

/** Every bound amoCRM trigger function of this credential, with the event chosen at creation. */
export const findAmoCrmBindings = async (ctx: IIntegrationBackendContext): Promise<IAmoCrmTriggerBinding[]> => {
  const documents = await ctx.getDocumentsByType(TRIGGER_FUNCTION_NAME);
  const bindings: IAmoCrmTriggerBinding[] = [];
  for (const triggerFunction of documents) {
    const body = getBodyData(triggerFunction);
    if (body?.vendor !== ctx.vendor || body.credentialId !== ctx.credentialId) continue;
    const spec = AMOCRM_WEBHOOK_TRIGGER_SPECS.find((candidate) => candidate.name === body.triggerName);
    if (!spec) continue;
    const eventValue = body.triggerConfig?.[AMOCRM_TRIGGER_EVENT_FIELD] ?? spec.events[0].value;
    const event = spec.events.find((candidate) => candidate.value === eventValue);
    if (!event) continue;
    bindings.push({ triggerFunction, spec, eventValue, setting: event.setting });
  }
  return bindings;
};

const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * The secret last path segment of this credential/env's webhook URL. amoCRM signs nothing, so knowing the URL is what
 * authenticates a delivery: the key is derived from the project's internal token (an HMAC of a server secret, stable
 * across restarts and replicas, never shown to tenant code), so it can't be guessed from the project/credential ids
 * that precede it in the URL.
 */
export const deriveAmoCrmRouteKey = async (ctx: IIntegrationBackendContext): Promise<string> => {
  const hash = await sha256Hex(`amocrm-webhook|${ctx.getInternalProjectToken()}|${ctx.credentialId}|${ctx.env}`);
  return `hook-${hash.slice(0, 40)}`;
};

/** `acme` of `acme.amocrm.ru` — what amoCRM sends as `account[subdomain]`. */
const expectedSubdomain = (ctx: IIntegrationBackendContext): string => (ctx.fields.account_domain ?? '').split('.')[0];

const reportProblem = async (ctx: IIntegrationBackendContext, message: string): Promise<void> => {
  await ctx.reportJournalProblem?.({ workflowId: `amocrm-webhooks-${ctx.credentialId}`, message, level: 'warn' });
};

const amocrmWebhooksRequest = (
  ctx: IIntegrationBackendContext,
  accessToken: string,
  method: 'POST' | 'DELETE',
  body: unknown,
): Promise<Response> =>
  fetch(`https://${ctx.fields.account_domain}/api/v4/webhooks`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * Points amoCRM's webhook for `destination` at exactly `settings`: removes it first (a webhook amoCRM disabled after
 * repeated failures comes back enabled), then subscribes again unless no trigger is bound any more. Throws with a
 * readable reason; the caller journals it.
 */
export const syncAmoCrmSubscription = async (
  ctx: IIntegrationBackendContext,
  destination: string,
  settings: readonly string[],
): Promise<void> => {
  if (!ctx.getOAuth2AccessToken) throw new Error('this host cannot refresh OAuth2 tokens');
  if (!ctx.fields.account_domain) throw new Error('the amoCRM account is not connected');
  const accessToken = await ctx.getOAuth2AccessToken();
  const removed = await amocrmWebhooksRequest(ctx, accessToken, 'DELETE', { destination });
  if (!removed.ok && removed.status !== 404) {
    const text = await removed.text();
    throw new Error(`DELETE /api/v4/webhooks answered ${removed.status} ${text.slice(0, 500)}`);
  }
  if (settings.length === 0) return;
  const added = await amocrmWebhooksRequest(ctx, accessToken, 'POST', { destination, settings });
  if (!added.ok) {
    const text = await added.text();
    throw new Error(`POST /api/v4/webhooks answered ${added.status} ${text.slice(0, 500)}`);
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const buildHandler =
  (ctx: IIntegrationBackendContext, bindings: readonly IAmoCrmTriggerBinding[]) =>
  async (request: Request): Promise<Response> => {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
    const payload = parseAmoCrmFormBody(rawBody);
    const account = readAmoCrmAccount(payload);
    if (account.subdomain !== null && account.subdomain !== expectedSubdomain(ctx)) {
      return new Response(null, { status: 403 });
    }
    const signals: Promise<void>[] = [];
    for (const binding of bindings) {
      for (const event of extractAmoCrmEvents(payload, binding.spec, binding.eventValue)) {
        // One run per event (a trigger function's run consumes a single signal); the id is a hash of the event, so
        // amoCRM re-delivering the same event doesn't start a second run while the first is still running.
        const signal = sha256Hex(JSON.stringify([event.entity, event.action, event.data])).then((hash) =>
          ctx.signalWorkflow({
            workflowId: `amocrm-${binding.triggerFunction.id}-${hash.slice(0, 24)}`,
            workflowType: binding.triggerFunction.name,
            signalName: AMOCRM_WEBHOOK_SIGNAL_NAME,
            signalArgs: [event],
          }),
        );
        signals.push(signal);
      }
    }
    // Answer in time even if waking a scaled-down runner takes longer — an undeliverable signal is journaled by the host.
    await Promise.race([Promise.allSettled(signals), sleep(RESPONSE_BUDGET_MS)]);
    return new Response(null, { status: 200 });
  };

// oxlint-disable-next-line no-empty-function -- the subscription deliberately outlives the target: dispose also runs on every backend restart, and unsubscribing then would lose the events of that gap.
const noopDispose = async (): Promise<void> => {};

/**
 * amoCRM webhook ingress for one credential/env: one secret route (`deriveAmoCrmRouteKey`) for every bound amoCRM
 * trigger function, and — when the host is publicly reachable — an amoCRM webhook subscription
 * (`POST /api/v4/webhooks`) for exactly the events those triggers listen to, made with the account's OAuth2 token.
 * Subscribing via the API needs an admin-authorized integration on the "Расширенный"/"Профессиональный" plans; when it
 * fails the reason, the URL and the events are written to the run journal so the webhook can be added by hand
 * (amoCRM → amoМаркет → Web hooks). Deliveries are form-encoded with PHP brackets and unsigned: the route key and the
 * `account[subdomain]` check are the authentication. Like every webhook vendor here, trigger functions bound after the
 * target started need the project's ingress restarted.
 */
export const registerAmoCrmBackend: TRegisterIntegrationBackend = async (ctx) => {
  const bindings = await findAmoCrmBindings(ctx);
  const key = await deriveAmoCrmRouteKey(ctx);
  ctx.registerWebHook(key, buildHandler(ctx, bindings));
  if (ctx.webhookUrl) {
    const destination = `${ctx.webhookUrl}/${key}`;
    const settings = [...new Set(bindings.map((binding) => binding.setting))];
    try {
      await syncAmoCrmSubscription(ctx, destination, settings);
    } catch (error) {
      if (settings.length > 0) {
        const reason = error instanceof Error ? error.message : String(error);
        await reportProblem(
          ctx,
          `amoCRM webhook subscription failed (${reason}). Add it by hand in amoCRM → amoМаркет → Web hooks: ` +
            `URL ${destination}, events ${settings.join(', ')}.`,
        );
      }
    }
  }
  return noopDispose;
};
