import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type {
  IIntegrationBackendContext,
  IIntegrationDocumentRecord,
  TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import { WEBHOOK_SIGNAL_NAME } from './constants.js';

interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
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

const buildRequestPayload = async (request: Request): Promise<IWebhookRequestPayload> => ({
  method: request.method,
  headers: Object.fromEntries(request.headers.entries()),
  body: await request.text(),
});

// oxlint-disable-next-line no-empty-function -- nothing to unregister remotely, no third-party service was ever told about this route.
const noopDispose = async (): Promise<void> => {};

/**
 * Unlike `registerTelegramBackend` (which picks webhook-vs-poll based on `ctx.webhookUrl`), a generic
 * inbound webhook has no third-party service to notify of its own URL and no meaningful "poll"
 * fallback — nothing to poll, requests only ever arrive pushed. So this ignores `ctx.webhookUrl`
 * entirely and always registers one local route per bound `trigger-function`: `ctx.registerWebHook`
 * works regardless of public-host mode (see `IntegrationsRuntimeService`'s `startTarget` — it just adds
 * an entry to the host's local route table), reachable at `/webhooks/webhook/:credentialId/:env/:uri`
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
    ctx.registerWebHook(triggerFunction.id, async (request) => {
      const payload = await buildRequestPayload(request);
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
