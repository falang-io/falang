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

/** ЮKassa's own REST resource collection for a notification's `event` prefix (`payment.succeeded` -> `payments`, `refund.succeeded` -> `refunds`). */
const resourceCollectionFor = (event: string): string => `${event.split('.')[0]}s`;

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

      const confirmResponse = await fetchConfirmedResource(
        `${YOOKASSA_API_BASE_URL}/${resourceCollectionFor(body.event)}/${body.object.id}`,
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

      const confirmedObject: unknown = await confirmResponse.json();
      await ctx.signalWorkflow({
        workflowId: `yookassa-${triggerFunction.id}`,
        workflowType: triggerFunction.name,
        signalName: YOOKASSA_SIGNAL_NAME,
        signalArgs: [{ event: body.event, object: confirmedObject }],
      });
      return new Response(null, { status: 200 });
    });
  }
  return noopDispose;
};
