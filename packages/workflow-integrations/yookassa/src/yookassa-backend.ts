import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type {
  IIntegrationBackendContext,
  IIntegrationDocumentRecord,
  TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import { YOOKASSA_SIGNAL_NAME } from './constants.js';

interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly credentialId: string;
}

interface IYookassaNotificationBody {
  readonly type?: string;
  readonly event?: string;
  readonly object?: { readonly id?: string };
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

/**
 * Resource types a notification may refer to, with the confirmed-object statuses that count as an event (`<type>.<status>`).
 * A status outside the list (e.g. a `pending` payment) is a state, not an event, and is ignored.
 */
const EVENT_STATUSES: Readonly<Record<string, readonly string[]>> = {
  payment: ['succeeded', 'waiting_for_capture', 'canceled'],
  refund: ['succeeded'],
  payout: ['succeeded', 'canceled'],
  deal: ['closed'],
};

/** ЮKassa's own REST resource collection for a notification's `event` prefix (`payment.succeeded` -> `payments`, `refund.succeeded` -> `refunds`). */
const resourceCollectionFor = (resourceType: string): string => `${resourceType}s`;

/** ЮKassa object ids are UUID-like; anything else never reaches the API URL (no path injection, no `..`/`?`/`/`). */
const OBJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const YOOKASSA_API_BASE_URL = 'https://api.yookassa.ru/v3';

/**
 * `btoa`, not Node's `Buffer` — this module is barrel-exported into `@falang/workflow-client`'s
 * browser bundle (see ADR 0017 (private)'s ЮKassa implementation notes), and `Buffer` doesn't exist
 * there. `btoa` is a global in both Node and every browser, and `shopId`/`secretKey` are always
 * ASCII, so its latin1-only restriction never bites.
 */
const basicAuthHeader = (shopId: string, secretKey: string): string => `Basic ${btoa(`${shopId}:${secretKey}`)}`;

const parseNotificationBody = (text: string): IYookassaNotificationBody | null => {
  try {
    return JSON.parse(text) as IYookassaNotificationBody;
  } catch {
    return null;
  }
};

/** `null` on a network-level failure (caller returns 502, letting ЮKassa retry) — any HTTP-level response, including a 404/5xx, is returned as-is for the caller to interpret. */
const fetchConfirmedResource = async (url: string, authHeader: string): Promise<Response | null> => {
  try {
    return await fetch(url, { headers: { Authorization: authHeader } });
  } catch {
    return null;
  }
};

// oxlint-disable-next-line no-empty-function -- nothing to unregister remotely: ЮKassa has no API call telling it to stop posting to us, the user just removes the webhook in their merchant cabinet.
const noopDispose = async (): Promise<void> => {};

/**
 * Registers one local route per bound `trigger-function`, same "always register, ignore
 * `ctx.webhookUrl`" shape as `@falang/workflow-integrations-webhook`/`-bitrix24`.
 *
 * Event semantics (security audit P1-10): the signalled `event` is derived from the confirmed object's own status, never taken
 * from the body, and the body's id is format-checked before it can reach the API URL.
 *
 * Verification, per ADR 0017 (private)'s ЮKassa implementation notes: unlike Bitrix24, ЮKassa's HTTP
 * notifications carry **no signature or shared secret at all** — the vendor's own docs recommend
 * either an IP-allowlist check (not usable through this host's current webhook dispatch layer, which
 * doesn't forward the original client IP to `registerBackend` handlers — a real, separate gap, see
 * the ADR) or re-confirming the notified resource by calling ЮKassa's own API with the merchant's
 * Basic-auth credentials and trusting *that* response instead of the notification body. This
 * implementation does the latter — the vendor-recommended, stronger of the two options anyway (a
 * real forged-webhook vulnerability of exactly this "trusted `payment.succeeded` on faith" shape has
 * been publicly reported for careless ЮKassa integrations). On every notification it re-fetches
 * `{resource}/{id}` from ЮKassa's API and only ever signals the workflow with what that GET actually
 * returned, never the notification body's own claimed `object`. A `fetch` failure (network/5xx)
 * returns 502 so ЮKassa retries — a genuine notification shouldn't be dropped over a transient error.
 * A confirmed 404 means the referenced id doesn't exist under this shop's own credentials (the actual
 * forgery signal) and is accepted-but-ignored (200, no signal) rather than retried forever.
 */
export const registerYookassaBackend: TRegisterIntegrationBackend = async (ctx) => {
  const triggerFunctions = await findBoundTriggerFunctions(ctx);
  const shopId = ctx.fields.shop_id;
  const secretKey = ctx.fields.secret_key;
  for (const triggerFunction of triggerFunctions) {
    ctx.registerWebHook(triggerFunction.id, async (request) => {
      const body = parseNotificationBody(await request.text());
      if (!body || body.type !== 'notification' || !body.event || !body.object?.id) {
        return new Response(null, { status: 400 });
      }
      if (!shopId || !secretKey) {
        return new Response(null, { status: 200 });
      }

      // Cheap checks on the claimed values before anything touches the network; the claimed event only selects *which*
      // resource to re-fetch — the event that is signalled is derived from the confirmed object's status below.
      const resourceType = body.event.split('.')[0];
      if (!Object.hasOwn(EVENT_STATUSES, resourceType) || !OBJECT_ID_PATTERN.test(body.object.id)) {
        return new Response(null, { status: 400 });
      }

      const confirmResponse = await fetchConfirmedResource(
        `${YOOKASSA_API_BASE_URL}/${resourceCollectionFor(resourceType)}/${encodeURIComponent(body.object.id)}`,
        basicAuthHeader(shopId, secretKey),
      );
      if (!confirmResponse) {
        return new Response(null, { status: 502 });
      }
      if (confirmResponse.status === 404) {
        return new Response(null, { status: 200 });
      }
      if (!confirmResponse.ok) {
        return new Response(null, { status: 502 });
      }

      const confirmedObject = (await confirmResponse.json()) as { readonly id?: unknown; readonly status?: unknown };
      const status = typeof confirmedObject.status === 'string' ? confirmedObject.status : '';
      const derivedEvent = `${resourceType}.${status}`;
      // Only what ЮKassa itself says the object is *now* counts: a notification whose claimed event disagrees with the
      // confirmed status (forged, replayed or stale) is acknowledged but not delivered to the workflow.
      if (
        confirmedObject.id !== body.object.id ||
        !EVENT_STATUSES[resourceType].includes(status) ||
        derivedEvent !== body.event
      ) {
        return new Response(null, { status: 200 });
      }
      await ctx.signalWorkflow({
        workflowId: `yookassa-${triggerFunction.id}`,
        workflowType: triggerFunction.name,
        signalName: YOOKASSA_SIGNAL_NAME,
        signalArgs: [{ event: derivedEvent, object: confirmedObject }],
      });
      return new Response(null, { status: 200 });
    });
  }
  return noopDispose;
};
