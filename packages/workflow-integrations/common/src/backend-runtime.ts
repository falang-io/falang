import type { INode } from '@falang/dto';

/** One project document of a given type, as far as an integration's inbound ingress needs to see it. */
export interface IIntegrationDocumentRecord {
  readonly id: string;
  readonly name: string;
  readonly data: unknown;
  readonly root: INode | null;
}

export interface IIntegrationSignalTarget {
  readonly workflowId: string;
  readonly workflowType: string;
  readonly signalName: string;
  readonly signalArgs: readonly unknown[];
}

/**
 * One repeating-interval clause of an `IScheduleSpec` — `every`/`offset` are Temporal-format Duration
 * strings (e.g. `'15 minutes'`, `'1h'`), matching `@temporalio/client`'s own `IntervalSpec.every`
 * string form. Kept as plain strings (not a `{value, unit}` pair) so this type needs no conversion on
 * either side of the `@falang/workflow-gateway` boundary — see ADR 0037 (private)
 * §2/§4.
 */
export interface IScheduleIntervalSpec {
  readonly every: string;
  readonly offset?: string;
}

/**
 * The recurrence rule for a Temporal Schedule, as built from a `schedule-interval`/`schedule-cron`
 * trigger's `contextFields` — a deliberately narrow subset of `@temporalio/client`'s own `ScheduleSpec`
 * (no calendars/skip/jitter/startAt/endAt, none of which v1 exposes), so this package (which ships into
 * the browser bundle, see the module-level note in `types.ts`) never needs to import `@temporalio/*`.
 */
export interface IScheduleSpec {
  readonly intervals?: readonly IScheduleIntervalSpec[];
  readonly cronExpressions?: readonly string[];
  readonly timeZone?: string;
}

/** Params for `IIntegrationBackendContext.upsertSchedule` — see its doc comment. */
export interface IUpsertScheduleParams {
  readonly scheduleId: string;
  readonly spec: IScheduleSpec;
  readonly workflowType: string;
  readonly workflowId: string;
  readonly args: readonly unknown[];
  readonly note?: string;
}

/**
 * The bare shape of a `files/File` reference (see `@falang/workflow-integrations-files`'s `IFileRef`,
 * ADR 0038 (private) §1) — declared here rather than imported so this
 * browser-safe package never depends on that vendor package (the dependency runs the other way: any
 * vendor whose ingress needs to turn incoming bytes into a `File`, e.g. Telegram media, depends on
 * `common` for this type, not on `files`).
 */
export interface IFileRefLike {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
  readonly publicUrl?: string;
}

/** Params for `IIntegrationBackendContext.uploadFile` — see its doc comment. */
export interface IUploadFileMeta {
  readonly name: string;
  readonly mime: string;
  /** Overrides the backend's own env/quota-derived TTL rule for this one file — see ADR 0038 (private) §2. */
  readonly ttlSeconds?: number;
  /** `'ingress:<vendor>'` for a vendor's own inbound media (e.g. Telegram's `'ingress:telegram'`) — see ADR 0038 (private) §5. */
  readonly createdBy: string;
}

/** One schedule's current state, as reported by `IIntegrationBackendContext.listSchedules`. */
export interface IScheduleState {
  readonly scheduleId: string;
  readonly paused: boolean;
  /** ISO-8601 timestamps, soonest first. */
  readonly nextFireTimes: readonly string[];
  /** ISO-8601, or `null` if this schedule has never fired yet. */
  readonly lastFireTime: string | null;
  readonly skippedOverlapCount: number;
  readonly missedCatchupCount: number;
}

/**
 * Everything a vendor's `registerBackend` needs to drive its own inbound ingress for one credential
 * instance/env, without knowing anything about the host (NestJS, TypeORM, Temporal, Express) it's
 * running inside of — see ADR 0006 (private) and its follow-up
 * on generalizing the webhook/poll split beyond Telegram. One `ctx` is built and handed to
 * `registerBackend` per (vendor, credentialId, projectId, env) target the host considers active (i.e.
 * the owning project's dev runner is running, or prod has been started — see
 * `@falang/workflow-backend`'s `BuildService`).
 */
export interface IIntegrationBackendContext {
  readonly vendor: string;
  readonly credentialId: string;
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
  /** This instance's `credentialFields` values, already resolved for `env` (secrets decrypted, dev-fallback applied per `secretProdOptional`). */
  readonly fields: Readonly<Record<string, string>>;
  /** Full external URL the host is reachable at for this target, if running in public-webhook mode; `null` in local-polling mode. */
  readonly webhookUrl: string | null;
  /** This target's Temporal task queue — see `@falang/workflow-backend`'s `devTaskQueue`/`prodTaskQueue`. */
  readonly taskQueue: string;

  /**
   * Mounts `handler` under this ctx's webhook route (`/webhooks/:vendor/:projectId/:credentialId/:env/<uri>`) —
   * only meaningful when `webhookUrl` is set. Standard fetch-API `Request`/`Response`, so vendor code
   * carries no Express/NestJS dependency. The host removes every route registered through a given
   * `ctx` automatically when that target stops (see `TRegisterIntegrationBackend`'s return value) —
   * a vendor never needs to unregister it manually.
   */
  registerWebHook(uri: string, handler: (request: Request) => Promise<Response>): void;

  /**
   * Runs `callback` every `intervalMs` while this target is active — the polling counterpart to
   * `registerWebHook`, used when `webhookUrl` is `null`. The host clears the interval automatically
   * when the target stops.
   */
  registerInterval(callback: () => Promise<void>, intervalMs: number): void;

  /** signalWithStart against this ctx's `taskQueue` — see ADR 0006 (private)'s "Runtime dialog continuation". */
  signalWorkflow(target: IIntegrationSignalTarget): Promise<void>;

  /** Documents of `type`, scoped to `ctx.projectId` — e.g. `'trigger-function'` to find the document bound to this credential. */
  getDocumentsByType(type: string): Promise<readonly IIntegrationDocumentRecord[]>;

  /**
   * This project's internal-API token — the same one `RunnerProcessManager` injects into its runner
   * pods (see ADR 0016 (private)'s "Namespace/RBAC model and inter-pod
   * auth"), minted (or returned, if already minted) on demand. `registerBackend` implementations that
   * call back into `backend`'s internal endpoints themselves — e.g. ActivePieces's polling trigger,
   * which drives the standalone `activepieces` service's `/poll` route, which in turn calls
   * `backend`'s credential resolver — present this instead of a shared secret, so a leaked token only
   * exposes this one project.
   */
  getInternalProjectToken(): string;

  /**
   * Creates this ctx's Temporal Schedule if it doesn't exist yet, or updates its spec/action and
   * **unpauses** it if it does — so a schedule paused by `dispose()`/`onRunnerIdle` (below) resumes
   * firing on the next reconcile instead of needing to be recreated. `scheduleId`/`workflowId` are the
   * caller's own (see ADR 0037 (private) §4's naming convention,
   * `sched-<env>-<docId>`/`sched-<docId>`); this ctx's own `taskQueue`/`projectId`/`env` are applied by
   * the implementation. Implemented in `@falang/workflow-gateway` over `client.schedule`, the same
   * "vendor code never holds a Temporal client directly" posture as `signalWorkflow` above.
   */
  upsertSchedule(params: IUpsertScheduleParams): Promise<void>;

  /**
   * Pauses (never deletes) a schedule previously created via `upsertSchedule` — e.g. on env stop
   * (`dispose()`, §4.2) or when this env's runner pod goes idle (`onRunnerIdle`, §6). `note` is the
   * human-readable reason shown in Temporal's own UI.
   */
  pauseSchedule(scheduleId: string, note?: string): Promise<void>;

  /** Deletes a schedule previously created via `upsertSchedule` outright — e.g. its bound `trigger-function` document was removed/unbound. */
  deleteSchedule(scheduleId: string): Promise<void>;

  /** Every schedule Temporal currently knows about for this ctx's `taskQueue` (i.e. this project/env). */
  listSchedules(): Promise<readonly IScheduleState[]>;

  /**
   * Uploads `source` into this project's object storage and returns the resulting `File` reference —
   * backs a vendor's own inbound-media resolution (e.g. Telegram's `resolveIncomingMedia`, see
   * `@falang/workflow-integrations-telegram`'s `telegram-media.ts`) the same way `signalWorkflow`
   * backs a vendor's outbound signal, so `registerBackend` never needs its own object-storage
   * credentials. Implemented in `@falang/workflow-gateway` over an injected `IFileUploadPort` (see
   * `file-upload-port.ts`) — throws if the host never configured one, the same posture as
   * `upsertSchedule` throwing without a `scheduleClient`. See
   * ADR 0038 (private) §2/§5.
   */
  uploadFile(source: ReadableStream<Uint8Array> | Uint8Array, meta: IUploadFileMeta): Promise<IFileRefLike>;
  /**
   * Writes a run-journal entry (`kind: 'error'`, default level `warn`) for input this vendor's ingress received but
   * could not hand to any workflow — a button press with no bound trigger function, say (ADR 0059 (private) §2c).
   * `workflowId` is the one the input would have targeted; `runId` is `null` when no run exists. The host adds the
   * project, env and vendor, applies the project's text policy and never throws. Optional so a host (or test double)
   * that has no journal still works — callers use `ctx.reportJournalProblem?.(…)`.
   */
  reportJournalProblem?(report: IJournalProblemReport): Promise<void>;
}

/** Params of `IIntegrationBackendContext.reportJournalProblem`. */
export interface IJournalProblemReport {
  readonly workflowId: string;
  readonly runId?: string | null;
  readonly documentId?: string | null;
  readonly nodeId?: string | null;
  readonly message: string;
  readonly data?: Record<string, unknown> | null;
  readonly level?: 'info' | 'warn' | 'error';
}

/**
 * What `registerBackend` may return in place of a bare `dispose` function — lets a vendor also react to
 * "this env's runner pod was just scaled to zero for being idle" (`onRunnerIdle`, e.g. the `schedule`
 * vendor pausing its dev schedules so they stop re-waking the pod every fire — see
 * ADR 0037 (private) §6) without every other vendor having to know about it. A
 * bare `dispose` function (every vendor written before this) is still accepted and normalized to
 * `{ dispose }` with no `onRunnerIdle` by the host.
 */
export interface IIntegrationBackendHandle {
  /** Same contract as the old bare return value — see `TRegisterIntegrationBackend`'s doc comment. */
  dispose(): Promise<void>;
  /**
   * Called by the host's `pauseProjectIntegrations(projectId, env)` — the target stays registered and
   * active (nothing is stopped/unregistered), this is only a "go quiet, the pod is down" notification.
   * Vendors with nothing to pause (the vast majority) simply don't implement it.
   */
  onRunnerIdle?(): Promise<void>;
  /**
   * The counterpart to `onRunnerIdle` — called by the host's `resumeProjectIntegrations(projectId, env)`
   * for a target that was **already active** (i.e. never stopped via `stopProjectIntegrations`, just
   * possibly `onRunnerIdle`-paused) when that project/env's ingress is resumed (a dev build restarting,
   * or prod being started again) — see ADR 0037 (private) §6 ("The next dev build
   * ... reconciles and un-pauses"). `resumeProjectIntegrations`'s own discovery-tick re-run only covers a
   * target that was actually stopped/never started; an already-active one needs this separate
   * notification instead, since neither `discoverTarget`/`discoverImplicitTarget` touch a key already
   * present in the host's active-target map. Vendors with nothing to resume (the vast majority,
   * including any with no `onRunnerIdle` either) simply don't implement it.
   */
  onRunnerResume?(): Promise<void>;
}

/**
 * Registers a vendor's inbound ingress for one target and returns either its `dispose()` directly, or an
 * `IIntegrationBackendHandle` for a vendor that also needs `onRunnerIdle`. The host calls `dispose()`
 * when the target stops (project dev/prod stop) — **after** it has already torn down every
 * `registerWebHook`/`registerInterval` registration made through this `ctx`, so `dispose()` only needs
 * to handle the vendor's own remote cleanup (e.g. Telegram's `deleteWebhook`), not local bookkeeping.
 */
export type TRegisterIntegrationBackend = (
  ctx: IIntegrationBackendContext,
) => Promise<(() => Promise<void>) | IIntegrationBackendHandle>;
