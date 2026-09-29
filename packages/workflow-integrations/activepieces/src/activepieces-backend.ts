import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type {
  IIntegrationBackendContext,
  IIntegrationDocumentRecord,
  TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import type { IActivepiecesTriggerCatalogEntry } from './catalog-types.js';
import { activepiecesTriggerNameFor } from './naming.js';

/** Revisit once there's a real deployment to tune against — see ADR 0011 (private). */
const POLL_INTERVAL_MS = 5000;

interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
  readonly triggerConfig?: Readonly<Record<string, string>>;
}

interface IPollResponse {
  readonly items?: readonly unknown[];
}

// oxlint-disable-next-line no-empty-function -- nothing to unregister remotely in poll mode, same as telegram-backend.ts's poll path.
const noopDispose = async (): Promise<void> => {};

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
 * Calls `falang-workflow-activepieces`'s poll endpoint — see ADR 0011 (private).
 * `ACTIVEPIECES_SERVICE_URL`/`ACTIVEPIECES_SERVICE_SECRET` are already set on `backend`'s own process
 * env per ADR 0010 (private) (used there for the `loadOptions` proxy
 * and the startup `GET /pieces` fetch) — this reads the same two env vars directly, since
 * `registerBackend` implementations have no NestJS DI access (see `telegram-backend.ts` for the same
 * pattern with `TELEGRAM_API_BASE_URL`). `rawTriggerName` is the piece's own trigger identifier (e.g.
 * `new_post`), not the qualified `ITriggerDescriptor.name` — see `activepiecesTriggerNameFor`.
 * `x-internal-api-key`/`ACTIVEPIECES_SERVICE_SECRET` only authorizes *this call itself* (`backend` ->
 * `activepieces`) — `projectId`/`internalProjectToken` travel in the body so the service can present
 * them back to `backend`'s own credential resolver when it resolves this piece's auth, per
 * ADR 0016 (private)'s "Namespace/RBAC model and inter-pod auth".
 */
const pollTrigger = async (
  pieceName: string,
  credentialId: string,
  rawTriggerName: string,
  propsValue: Readonly<Record<string, string>>,
  projectId: string,
  internalProjectToken: string,
): Promise<readonly unknown[]> => {
  const baseUrl = process.env.ACTIVEPIECES_SERVICE_URL;
  const secret = process.env.ACTIVEPIECES_SERVICE_SECRET;
  if (!baseUrl || !secret) return [];

  const response = await fetch(
    `${baseUrl}/credentials/${credentialId}/pieces/${pieceName}/triggers/${rawTriggerName}/poll`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': secret },
      body: JSON.stringify({ propsValue, projectId, internalProjectToken }),
    },
  );
  if (!response.ok) {
    throw new Error(`ActivePieces poll failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as IPollResponse;
  return data.items ?? [];
};

/**
 * Drives one ActivePieces piece's polling trigger(s) for one credential/env — the ActivePieces
 * counterpart to `registerTelegramBackend`. `pieceName`/`triggers` are closed over (rather than
 * derived from `ctx.vendor`) since `piece-to-credential-integration.ts` already has both when
 * building this vendor's `registerBackend`. `triggers` is used only to build the qualified-name ->
 * raw-name lookup (`ITriggerDescriptor.name`/`signalName` are vendor-qualified — see
 * `activepiecesTriggerNameFor` — but the poll endpoint needs the piece's own raw trigger name). See
 * ADR 0011 (private)'s Decision 2 for why polling is scheduled here
 * (`backend`) but executed by the `activepieces/` service.
 *
 * Bound `trigger-function` documents are re-listed on every tick (not cached at registration time),
 * so one bound after this target started is picked up without a restart — same as Telegram's
 * `findBoundTriggerFunctions` call inside its own poll loop.
 */
export const registerActivepiecesBackend =
  (pieceName: string, triggers: readonly IActivepiecesTriggerCatalogEntry[]): TRegisterIntegrationBackend =>
  (ctx) => {
    const rawTriggerNameByQualifiedName = new Map(
      triggers.map((trigger) => [activepiecesTriggerNameFor(pieceName, trigger.name), trigger.name]),
    );

    ctx.registerInterval(async () => {
      const triggerFunctions = await findBoundTriggerFunctions(ctx);
      for (const doc of triggerFunctions) {
        const body = getTriggerFunctionBodyData(doc);
        const rawTriggerName = body && rawTriggerNameByQualifiedName.get(body.triggerName);
        if (!body || !rawTriggerName) continue;

        // oxlint-disable-next-line no-await-in-loop -- sequential, low-frequency (interval tick, not a hot path) — mirrors telegram-backend.ts's loop over updates.
        const items = await pollTrigger(
          pieceName,
          ctx.credentialId,
          rawTriggerName,
          body.triggerConfig ?? {},
          ctx.projectId,
          ctx.getInternalProjectToken(),
        );
        for (const item of items) {
          /**
           * A unique `workflowId` per item, not fixed per trigger-function (unlike Telegram's
           * `tg-${id}-${chatId}`, which correlates an ongoing conversation) — a polling trigger has no
           * conversation to correlate, and a fixed id would break if two new items land in the same
           * tick: the second `signalWithStart` would just re-signal the first item's still-open
           * execution instead of starting its own, since the compiled trigger-function's
           * `condition(() => hasSignal)` only gates once. See ADR 0011 (private).
           */
          // oxlint-disable-next-line no-await-in-loop -- one signal per item; order doesn't matter here (unlike Telegram's offset tracking) but sequential keeps this simple.
          await ctx.signalWorkflow({
            // Node ≥19 (and every browser) exposes `randomUUID` as a global `crypto` method — used
            // instead of importing it from `node:crypto` because this file is transitively reachable
            // from `@falang/workflow-client`'s browser bundle via this package's barrel export (see
            // `piece-to-credential-integration.ts`); a bare `node:crypto` import gets externalized by
            // Vite into a stub that throws the instant the module is evaluated in the browser,
            // crashing the whole client app before React ever renders anything (same failure mode as
            // `telegram-backend.ts`'s top-level `process.env` guard, different Node API).
            workflowId: `ap-${doc.id}-${crypto.randomUUID()}`,
            workflowType: doc.name,
            signalName: body.triggerName,
            signalArgs: [item],
          });
        }
      }
    }, POLL_INTERVAL_MS);
    // Nothing to unregister remotely in poll mode — the host clears the interval itself on stop.
    return Promise.resolve(noopDispose);
  };
