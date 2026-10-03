import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type {
  IIntegrationBackendContext,
  IIntegrationDocumentRecord,
  TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import { BITRIX24_SIGNAL_NAME } from './constants.js';
import { parseBracketFormBody, readApplicationToken, safeEqual } from './parse-bracket-form-body.js';

interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly credentialId: string;
}

interface IBitrix24OutgoingWebhookAuth {
  readonly application_token?: string;
  readonly domain?: string;
  readonly member_id?: string;
}

interface IBitrix24OutgoingWebhookBody {
  readonly event?: string;
  readonly data?: unknown;
  readonly ts?: string;
  readonly auth?: IBitrix24OutgoingWebhookAuth;
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

// oxlint-disable-next-line no-empty-function -- nothing to unregister remotely: Bitrix24 has no API call telling it to stop posting to us, the user just removes the outgoing webhook from their portal's own settings.
const noopDispose = async (): Promise<void> => {};

/**
 * Registers one local route per bound `trigger-function`, mirroring
 * `registerWebhookBackend`'s (`@falang/workflow-integrations-webhook`) "always register, ignore
 * `ctx.webhookUrl`" shape — like the generic webhook, Bitrix24's outgoing webhook has no
 * third-party registration API: the user pastes this route's URL by hand into their portal's
 * "Developer resources > Other > Outgoing webhook" settings. What's Bitrix24-specific is the body
 * format and the verification step below.
 *
 * Verified against Bitrix24's own REST API docs (2026-09-16, see ADR 0017 (private)'s Bitrix24
 * implementation notes): the outgoing webhook POSTs `application/x-www-form-urlencoded` with
 * bracket-notation nesting (`event`, `data[FIELDS][...]`, `ts`, `auth[domain]`,
 * `auth[member_id]`, `auth[application_token]`) — parsed via `parseBracketFormBody`. There is no
 * HMAC/signature scheme, just a shared-secret equality check: the request is only trusted if
 * `auth[application_token]` matches the token shown on that portal's own outgoing-webhook settings
 * screen (stored as this credential's `application_token` field). A mismatch, or either side missing
 * the token, is rejected with 403 before `signalWorkflow` is ever called. The verification token
 * itself is stripped from the payload handed to the workflow — it's a shared secret, not data the
 * user's workflow code should need to see or accidentally log.
 */
export const registerBitrix24Backend: TRegisterIntegrationBackend = async (ctx) => {
  const triggerFunctions = await findBoundTriggerFunctions(ctx);
  const expectedToken = ctx.fields.application_token;
  for (const triggerFunction of triggerFunctions) {
    ctx.registerWebHook(triggerFunction.id, async (request) => {
      const rawBody = await request.text();
      // Verify first, on the flat token only — nothing nested is parsed for an unauthenticated caller.
      const receivedToken = readApplicationToken(rawBody);
      if (!expectedToken || typeof receivedToken !== 'string' || !safeEqual(receivedToken, expectedToken)) {
        return new Response(null, { status: 403 });
      }
      const parsed = parseBracketFormBody(rawBody) as IBitrix24OutgoingWebhookBody;
      await ctx.signalWorkflow({
        workflowId: `bitrix24-${triggerFunction.id}`,
        workflowType: triggerFunction.name,
        signalName: BITRIX24_SIGNAL_NAME,
        signalArgs: [
          {
            event: parsed.event ?? '',
            data: parsed.data ?? null,
            ts: parsed.ts ?? '',
            domain: parsed.auth?.domain ?? '',
            memberId: parsed.auth?.member_id ?? '',
          },
        ],
      });
      return new Response(null, { status: 200 });
    });
  }
  return noopDispose;
};
