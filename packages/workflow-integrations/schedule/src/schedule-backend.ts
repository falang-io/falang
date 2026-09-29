import { TRIGGER_FUNCTION_BODY_NAME, TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type {
  IIntegrationBackendContext,
  IIntegrationBackendHandle,
  IIntegrationDocumentRecord,
  IScheduleSpec,
  IScheduleState,
  IUpsertScheduleParams,
  TRegisterIntegrationBackend,
} from '@falang/workflow-integrations-common';
import { SCHEDULE_CRON_TIMEZONE_FIELD_NAME, SCHEDULE_VENDOR } from './constants.js';
import { buildScheduleSpec } from './schedule-spec.js';

/** Same "re-read every tick so a newly bound trigger is picked up without a restart" reasoning as `0011`'s ActivePieces polling and `webhook`'s own known-limitation note — see ADR 0037 (private) §4.1. */
const RECONCILE_INTERVAL_MS = 30_000;

/** Applied when a bound document has no explicit `timezone` context field (`schedule-interval`, which has none at all) — see ADR 0037 (private) §4's `args` bullet. */
const DEFAULT_FIRE_TIMEZONE = 'UTC';

interface ITriggerFunctionBodyData {
  readonly vendor: string;
  readonly triggerName: string;
  readonly credentialId: string;
  readonly triggerConfig?: Readonly<Record<string, string>>;
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

/** `sched-<env>-<triggerFunctionDocumentId>` — see ADR 0037 (private) §4. */
const scheduleIdFor = (env: IIntegrationBackendContext['env'], documentId: string): string =>
  `sched-${env}-${documentId}`;

/** `sched-<docId>` — Temporal appends `-<scheduledTime>` itself for each started execution. */
const workflowIdFor = (documentId: string): string => `sched-${documentId}`;

const logSkippedDocument = (doc: IIntegrationDocumentRecord, error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  // No injectable logger reaches a vendor package's `registerBackend` (see `telegram-backend.ts`/
  // `activepieces-backend.ts` for the same "no NestJS DI here" constraint) — `console.warn` is the
  // best available signal, surfaced in `backend`'s own process logs. One bad document must not stop
  // the rest of this tick's reconcile (a project can have several trigger-functions of this vendor).
  // oxlint-disable-next-line no-console -- deliberate, see the comment above.
  console.warn(`[${SCHEDULE_VENDOR}] Skipping trigger-function "${doc.id}" ("${doc.name}"): ${message}`);
};

type TScheduleSpecResult =
  | { readonly ok: true; readonly spec: IScheduleSpec }
  | { readonly ok: false; readonly error: unknown };

/** Wraps `buildScheduleSpec` so a bad `triggerConfig` on one document can be logged and skipped without throwing out of `reconcile`'s loop — see its own doc comment. */
const tryBuildScheduleSpec = (
  triggerName: string,
  triggerConfig: Readonly<Record<string, string>>,
): TScheduleSpecResult => {
  try {
    return { ok: true, spec: buildScheduleSpec(triggerName, triggerConfig) };
  } catch (error) {
    return { ok: false, error };
  }
};

/**
 * Drives reconciliation of Temporal Schedules for every `trigger-function` bound to a `schedule-*`
 * trigger of this credential/env — see ADR 0037 (private) §4. Unlike
 * `registerWebhookBackend`/`registerActivepiecesBackend`, this also *deletes* schedules whose bound
 * document is gone, and skips re-`upsertSchedule`-ing ones whose desired params haven't changed since
 * the last successful upsert THIS PROCESS made (`lastUpsertedParams`, keyed by `scheduleId`) — Temporal
 * schedule creation isn't free (`upsertSchedule` always ends in a real `client.schedule.create`/
 * `handle.update` round trip), and re-sending identical params every 30s for the lifetime of every
 * project with a schedule would be pure overhead. A schedule that's currently `paused` is always
 * re-upserted regardless of `lastUpsertedParams` — `upsertSchedule` unpauses on update (see its own doc
 * comment), which is exactly how a schedule paused by `dispose()`/`onRunnerIdle` below resumes on the
 * next reconcile after this target restarts.
 */
export const registerScheduleBackend: TRegisterIntegrationBackend = async (ctx) => {
  const lastUpsertedParams = new Map<string, string>();
  const scheduleIdPrefix = `sched-${ctx.env}-`;
  // Set by `onRunnerIdle`, cleared by `onRunnerResume` — while `true`, `reconcile` must not upsert
  // anything (it would just re-unpause what `onRunnerIdle` just paused, since a paused schedule's own
  // `alreadyUpToDate` check below is always `false`). Deleting a now-unbound document's stale schedule
  // is still safe to do while paused — see ADR 0037 (private) §6.
  let pausedByIdle = false;

  const reconcile = async (): Promise<void> => {
    const triggerFunctions = await findBoundTriggerFunctions(ctx);
    const existing = await ctx.listSchedules();
    const existingById = new Map<string, IScheduleState>(existing.map((state) => [state.scheduleId, state]));
    const desiredScheduleIds = new Set<string>();

    for (const doc of triggerFunctions) {
      const body = getTriggerFunctionBodyData(doc);
      if (!body) continue;

      const scheduleId = scheduleIdFor(ctx.env, doc.id);
      desiredScheduleIds.add(scheduleId);
      if (pausedByIdle) continue;

      const specResult = tryBuildScheduleSpec(body.triggerName, body.triggerConfig ?? {});
      if (!specResult.ok) {
        logSkippedDocument(doc, specResult.error);
        continue;
      }
      const { spec } = specResult;

      const timezone = body.triggerConfig?.[SCHEDULE_CRON_TIMEZONE_FIELD_NAME] ?? DEFAULT_FIRE_TIMEZONE;
      const upsertParams: IUpsertScheduleParams = {
        scheduleId,
        spec,
        workflowType: doc.name,
        workflowId: workflowIdFor(doc.id),
        // `scheduledAt` is always overwritten by the compiled `'start'`-delivery preamble from
        // Temporal's own `TemporalScheduledStartTime` search attribute — this placeholder value is
        // never actually read, see `schedule.integration.ts`'s doc comment on `scheduleFireType`.
        args: [{ scheduledAt: '', timezone }],
        note: `falang trigger-function ${doc.id} (${doc.name})`,
      };
      const paramsKey = JSON.stringify(upsertParams);

      const existingState = existingById.get(scheduleId);
      const alreadyUpToDate =
        existingState && !existingState.paused && lastUpsertedParams.get(scheduleId) === paramsKey;
      if (alreadyUpToDate) continue;

      // oxlint-disable-next-line no-await-in-loop -- sequential, low-frequency (30s reconcile tick, not a hot path) — same reasoning as telegram-backend.ts's loop over updates.
      await ctx.upsertSchedule(upsertParams);
      lastUpsertedParams.set(scheduleId, paramsKey);
    }

    for (const state of existing) {
      if (!state.scheduleId.startsWith(scheduleIdPrefix)) continue;
      if (desiredScheduleIds.has(state.scheduleId)) continue;
      // oxlint-disable-next-line no-await-in-loop -- sequential, same reasoning as above.
      await ctx.deleteSchedule(state.scheduleId);
      lastUpsertedParams.delete(state.scheduleId);
    }
  };

  await reconcile();
  ctx.registerInterval(reconcile, RECONCILE_INTERVAL_MS);

  const pauseAllOwnSchedules = async (note: string): Promise<void> => {
    const states = await ctx.listSchedules();
    for (const state of states) {
      if (!state.scheduleId.startsWith(scheduleIdPrefix)) continue;
      // oxlint-disable-next-line no-await-in-loop -- sequential; a handful of schedules per project, not a hot path.
      await ctx.pauseSchedule(state.scheduleId, note);
    }
  };

  const handle: IIntegrationBackendHandle = {
    // Env stopped (§4.2): pause, never delete — the next start's reconcile unpauses via `upsertSchedule`.
    dispose: () => pauseAllOwnSchedules('Environment stopped'),
    // Runner pod scaled to zero for being idle (§6) — dev only; prod schedules keep firing and rely on
    // `ScheduleWakeService` to wake the pod back up before the next fire. Sets `pausedByIdle` BEFORE
    // pausing so the very next `reconcile` tick (already scheduled via `registerInterval`, could fire at
    // any moment) can't race this and re-upsert (which would silently unpause again within ≤30s).
    onRunnerIdle: async () => {
      if (ctx.env !== 'dev') return;
      pausedByIdle = true;
      await pauseAllOwnSchedules('Dev runner idle');
    },
    // Counterpart to `onRunnerIdle` — the host calls this for an already-active target when the
    // project/env's ingress resumes (dev build restarting, or prod started again). Clearing the flag
    // and re-running `reconcile` is enough: a schedule Temporal reports as `paused` always fails
    // `alreadyUpToDate` regardless of `lastUpsertedParams`, so `reconcile` re-upserts (using whatever
    // `triggerConfig` is current right now, not necessarily what was paused) and `upsertSchedule`
    // unpauses on update — see ADR 0037 (private) §6 ("The next dev build ...
    // reconciles and un-pauses"). A no-op if this target was never paused by idle in the first place.
    onRunnerResume: async () => {
      if (!pausedByIdle) return;
      pausedByIdle = false;
      await reconcile();
    },
  };
  return handle;
};
