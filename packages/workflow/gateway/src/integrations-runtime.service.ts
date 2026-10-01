// oxlint-disable no-await-in-loop -- every loop below is a sequential, deliberately-not-parallel drive over targets (discovery, startup registration — low-frequency, not a hot path).
// oxlint-disable max-lines -- over the default cap because of the new `ensureRunnerRunning`/`setEnsureRunnerRunning` wake-on-signal wiring (ADR 0016 (private)'s Phase 2 "Scale-to-zero" follow-up), not accumulated complexity.
import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { IIntegrationBackendHandle, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import type { IIntegrationCredentialInstance, IIntegrationsDiscoveryPort } from './discovery-port.js';
import type { IFileUploadPort } from './file-upload-port.js';
import type { IScheduleClientPort } from './schedule-client.js';
import type { TSignalWorkflowWithStart } from './signal-workflow.js';

/** How often the discovery loop re-lists credential instances to pick up newly configured/removed ones. */
const DISCOVERY_INTERVAL_MS = 30_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type TEnv = 'dev' | 'prod';

/** Called right before a trigger-driven signal goes out, so an idle-scaled-down runner pod is restarted first instead of the signal queuing forever — see ADR 0016 (private)'s Phase 2 "Scale-to-zero" follow-up; wired via `setEnsureRunnerRunning` below. */
export type TEnsureRunnerRunning = (params: {
  readonly projectId: string;
  readonly env: TEnv;
  readonly taskQueue: string;
}) => Promise<void>;

interface IKnownTarget {
  readonly vendor: string;
  readonly credentialId: string;
  readonly projectId: string;
  readonly env: TEnv;
}

/**
 * **Must** include `projectId` — an *implicit* target's `credentialId` is the vendor's own id (see
 * `discoverImplicitTarget` below), identical across every project that gets one, so a key built from
 * `vendor:credentialId:env` alone collides between two different projects' implicit targets of the
 * same vendor/env (e.g. two projects both using the credential-less `schedule` vendor's `dev` target)
 * — whichever project's `discoverImplicitTarget` call ran last would silently win the shared
 * `knownTargets`/`activeTargets`/`stoppedTargets` entry, leaving the other project's target either
 * never started or started-then-immediately-shadowed. An *explicit* target's `credentialId` (a real
 * instance id) happens to already be project-unique in practice, so this was latent until a
 * credential-less vendor with more than one project using it existed — found while testing
 * `pauseProjectIntegrations` (ADR 0037 (private) §4/§6) against two projects both
 * running the `schedule` vendor.
 */
const targetKey = (target: Pick<IKnownTarget, 'vendor' | 'credentialId' | 'projectId' | 'env'>): string =>
  `${target.vendor}:${target.credentialId}:${target.projectId}:${target.env}`;

/** **Must** include `projectId`: credential ids are client-chosen, so two projects can share one — see ADR 0044 (private) security audit P0-6. */
const webhookHandlerKey = (vendor: string, projectId: string, credentialId: string, env: string, uri: string): string =>
  `${vendor}/${projectId}/${credentialId}/${env}/${uri}`;

interface IActiveTarget {
  readonly dispose: () => Promise<void>;
  readonly onRunnerIdle: (() => Promise<void>) | undefined;
  readonly onRunnerResume: (() => Promise<void>) | undefined;
  readonly webhookKeys: readonly string[];
  readonly intervalHandles: readonly NodeJS.Timeout[];
}

/** Normalizes `TRegisterIntegrationBackend`'s two possible return shapes (a bare `dispose` function, or a full `IIntegrationBackendHandle`) into one. */
const normalizeBackendHandle = (
  result: (() => Promise<void>) | IIntegrationBackendHandle,
): IIntegrationBackendHandle => (typeof result === 'function' ? { dispose: result } : result);

export interface IIntegrationsRuntimeParams {
  readonly integrations: readonly IWorkflowIntegration[];
  readonly discovery: IIntegrationsDiscoveryPort;
  readonly signalWorkflowWithStart: TSignalWorkflowWithStart;
  /** Base URL this process is externally reachable at (e.g. `https://bots.example.com`) — omit for the polling fallback. See ADR 0006. */
  readonly publicHost?: string;
  readonly temporalAddress?: string;
  readonly namespace?: string;
  /**
   * Backs `ctx.getInternalProjectToken()` — see `@falang/workflow-integrations-common`'s
   * `IIntegrationBackendContext` doc comment and ADR 0016 (private)'s
   * "Namespace/RBAC model and inter-pod auth". Omitted only by hosts that don't wire it up (e.g. a
   * bare `forRoot` in a test) — `ctx.getInternalProjectToken()` throws if actually called without it.
   */
  readonly getInternalProjectToken?: (projectId: string) => string;
  /**
   * Backs `ctx.upsertSchedule`/`pauseSchedule`/`deleteSchedule`/`listSchedules` — see
   * `@falang/workflow-integrations-common`'s `IIntegrationBackendContext` doc comments and
   * ADR 0037 (private) §4. Omitted only by hosts that don't wire it up (e.g. a
   * bare `forRoot` in a test, or a host with no schedule-shaped vendor registered) — each of those four
   * ctx methods throws if actually called without it, the same posture as `getInternalProjectToken`.
   */
  readonly scheduleClient?: IScheduleClientPort;
  /**
   * Backs `ctx.uploadFile()` — see `@falang/workflow-integrations-common`'s `IIntegrationBackendContext`
   * doc comment and ADR 0038 (private) §2/§5. Omitted only by hosts that
   * don't wire it up (e.g. a bare `forRoot` in a test, or a host with no vendor whose ingress needs
   * it) — `ctx.uploadFile()` throws if actually called without it, the same posture as `scheduleClient`.
   */
  readonly fileUpload?: IFileUploadPort;
}

/**
 * Generic host for every registered vendor's `registerBackend` (see
 * `@falang/workflow-integrations-common`'s `IIntegrationBackendContext`) — replaces the old
 * `IWebhookDecoder`/`IVendorChannel` split with a single contract each vendor drives itself, and owns
 * the webhook route table (`findWebhookHandler`, consulted by `IntegrationWebhookController`) plus
 * every registered polling interval's lifecycle.
 *
 * Mode is picked once per process from `publicHost` (per ADR 0006 — "gateway checks the env, not
 * per-vendor config"): set means every discovered target gets `ctx.webhookUrl` and is expected to call
 * `ctx.registerWebHook`; unset means `ctx.webhookUrl` is `null` and targets are expected to call
 * `ctx.registerInterval` instead. A background discovery loop re-lists credential instances so one
 * added after this process started is picked up without a restart, and re-checks any instance/env
 * `resolveCredentialFields` couldn't yet resolve a value for.
 */
export class IntegrationsRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationsRuntimeService.name);
  private readonly integrations: readonly IWorkflowIntegration[];
  private readonly discovery: IIntegrationsDiscoveryPort;
  private readonly signalWorkflowWithStart: TSignalWorkflowWithStart;
  private readonly publicHost: string | undefined;
  private readonly temporalAddress: string | undefined;
  private readonly namespace: string | undefined;
  private readonly getInternalProjectToken: ((projectId: string) => string) | undefined;
  private readonly scheduleClient: IScheduleClientPort | undefined;
  private readonly fileUpload: IFileUploadPort | undefined;

  private readonly webhookHandlers = new Map<string, (request: Request) => Promise<Response>>();
  private readonly activeTargets = new Map<string, IActiveTarget>();
  /** Every target the discovery loop has ever seen — lets `stopProjectIntegrations`/`resumeProjectIntegrations` find a project's targets without the discovery port needing its own project-scoped lookup. */
  private readonly knownTargets = new Map<string, IKnownTarget>();
  /** Targets explicitly stopped via `stopProjectIntegrations` — checked by the discovery loop so it doesn't restart what was just stopped. Cleared only by `resumeProjectIntegrations`. */
  private readonly stoppedTargets = new Set<string>();
  /**
   * Per-env set of projects whose ingress has been explicitly turned on via
   * `resumeProjectIntegrations` — a project's `dev`/`prod` env must not start merely because a
   * credential exists: `dev` only actually runs once `BuildService.build()` starts its runner, `prod`
   * only once the client's Start toggle calls `BuildService.startProd`. So the discovery loop marks a
   * *newly discovered* target stopped unless its project is already in the matching set — this keeps
   * separate projects that happen to share a vendor credential (e.g. the same Telegram bot token used
   * for local testing across projects) from both polling at once when only one has its runner running.
   */
  private readonly activatedProjects: Record<TEnv, Set<string>> = { dev: new Set(), prod: new Set() };
  private stopped = false;
  private ensureRunnerRunning: TEnsureRunnerRunning | undefined;

  constructor(params: IIntegrationsRuntimeParams) {
    this.integrations = params.integrations;
    this.discovery = params.discovery;
    this.signalWorkflowWithStart = params.signalWorkflowWithStart;
    this.publicHost = params.publicHost;
    this.temporalAddress = params.temporalAddress;
    this.namespace = params.namespace;
    this.getInternalProjectToken = params.getInternalProjectToken;
    this.scheduleClient = params.scheduleClient;
    this.fileUpload = params.fileUpload;
  }

  onModuleInit(): void {
    this.discoveryLoop().catch((error: unknown) => {
      this.logger.error('Integrations discovery loop crashed', error instanceof Error ? error.stack : error);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    for (const key of Array.from(this.activeTargets.keys())) {
      await this.stopTarget(key);
    }
  }

  /** Consulted by `IntegrationWebhookController` for every inbound `POST /webhooks/:vendor/:projectId/:credentialId/:env[/:uri]`. */
  findWebhookHandler(
    vendor: string,
    projectId: string,
    credentialId: string,
    env: string,
    uri: string,
  ): ((request: Request) => Promise<Response>) | undefined {
    return this.webhookHandlers.get(webhookHandlerKey(vendor, projectId, credentialId, env, uri));
  }

  /**
   * Stops every active target belonging to `projectId`/`env` — e.g. when the client hits "stop" on a
   * project's dev build. Persists past the next discovery tick — the target stays stopped until
   * `resumeProjectIntegrations` clears it, even though `findCredentialInstances()` keeps reporting the
   * credential as configured.
   */
  stopProjectIntegrations(projectId: string, env: TEnv): void {
    this.activatedProjects[env].delete(projectId);
    for (const target of this.knownTargets.values()) {
      if (target.projectId !== projectId || target.env !== env) continue;
      this.stoppedTargets.add(targetKey(target));
      this.stopTarget(targetKey(target)).catch((error: unknown) => {
        this.logger.error(`Failed to stop target ${targetKey(target)}`, error instanceof Error ? error.stack : error);
      });
    }
  }

  /**
   * A lighter sibling of `stopProjectIntegrations` — targets belonging to `projectId`/`env` stay
   * registered and active (nothing is stopped/unregistered), this only notifies each one's
   * `onRunnerIdle` (if it implements one) that this env's runner pod just went idle. Driven by
   * `@falang/workflow-backend`'s `BuildService` forwarding `RunnerIdleSweepService`'s stops for
   * `env === 'dev'` — see ADR 0037 (private) §6 (the `schedule` vendor pauses its
   * dev schedules here so a forgotten short-period dev schedule doesn't keep re-waking the pod forever).
   * Best-effort: a vendor's `onRunnerIdle` throwing is logged, never propagated — one vendor's failure
   * shouldn't block another's.
   */
  async pauseProjectIntegrations(projectId: string, env: TEnv): Promise<void> {
    for (const [key, target] of this.knownTargets) {
      if (target.projectId !== projectId || target.env !== env) continue;
      const active = this.activeTargets.get(key);
      if (!active?.onRunnerIdle) continue;
      try {
        await active.onRunnerIdle();
      } catch (error) {
        this.logger.error(`onRunnerIdle failed for target ${key}`, error instanceof Error ? error.stack : error);
      }
    }
  }

  /**
   * Lets `@falang/workflow-backend`'s `BuildService` hook itself in from its own `onModuleInit()` —
   * not a constructor param like `getInternalProjectToken`, since `BuildService` already depends on
   * this service, so threading the hook back through the constructor would be circular. A host that
   * never calls this just keeps `signalWorkflow`'s current unconditional-signal behavior.
   */
  setEnsureRunnerRunning(ensureRunnerRunning: TEnsureRunnerRunning): void {
    this.ensureRunnerRunning = ensureRunnerRunning;
  }

  /**
   * Counterpart to `stopProjectIntegrations` — call when a project's dev build starts again (or prod is
   * started) so its targets are picked back up right away instead of waiting for the next discovery
   * tick. Also notifies `onRunnerResume` on every target of this project/env that was already active
   * (see that method's own doc comment for why `discoveryTick()` alone can't cover it) — e.g. the
   * `schedule` vendor un-pausing dev schedules it paused on the previous `onRunnerIdle`, per
   * ADR 0037 (private) §6.
   */
  resumeProjectIntegrations(projectId: string, env: TEnv): void {
    this.activatedProjects[env].add(projectId);
    for (const target of this.knownTargets.values()) {
      if (target.projectId === projectId && target.env === env) this.stoppedTargets.delete(targetKey(target));
    }
    this.discoveryTick().catch((error: unknown) => {
      this.logger.error('Integrations discovery tick crashed', error instanceof Error ? error.stack : error);
    });
    this.resumeAlreadyActiveTargets(projectId, env).catch((error: unknown) => {
      this.logger.error('onRunnerResume sweep crashed', error instanceof Error ? error.stack : error);
    });
  }

  /**
   * `discoveryTick()`/`discoverTarget`/`discoverImplicitTarget` all skip a key already present in
   * `activeTargets` — correct for "don't double-register a target", but it means a target that was
   * never stopped (just `onRunnerIdle`-paused by `pauseProjectIntegrations`) gets no signal at all that
   * its project/env has resumed. This sweep is that missing signal, mirroring `pauseProjectIntegrations`
   * itself: best-effort, one vendor's `onRunnerResume` throwing is logged and doesn't block another's.
   */
  private async resumeAlreadyActiveTargets(projectId: string, env: TEnv): Promise<void> {
    for (const [key, target] of this.knownTargets) {
      if (target.projectId !== projectId || target.env !== env) continue;
      const active = this.activeTargets.get(key);
      if (!active?.onRunnerResume) continue;
      try {
        await active.onRunnerResume();
      } catch (error) {
        this.logger.error(`onRunnerResume failed for target ${key}`, error instanceof Error ? error.stack : error);
      }
    }
  }

  private async discoveryLoop(): Promise<void> {
    while (!this.stopped) {
      await this.discoveryTick();
      if (this.stopped) return;
      await sleep(DISCOVERY_INTERVAL_MS);
    }
  }

  private async discoveryTick(): Promise<void> {
    const instances = await this.discovery.findCredentialInstances();
    // Every vendor a project has an explicit credential instance for, regardless of whether that vendor
    // is currently registered/has a `registerBackend` — this is what the implicit-target rule below
    // checks "does this project already have an explicit instance of this vendor" against, per
    // ADR 0037 (private) §4's additive rule (`webhook`'s pre-existing explicit
    // instances must keep producing their own target, never a second implicit one alongside it).
    const explicitVendorsByProject = new Map<string, Set<string>>();
    for (const instance of instances) {
      const integration = this.integrations.find(
        (candidate) => candidate.vendor === instance.vendor && candidate.registerBackend,
      );
      if (integration?.registerBackend) {
        for (const env of ['dev', 'prod'] as const) {
          await this.discoverTarget(integration, instance, env);
        }
      }
      let vendors = explicitVendorsByProject.get(instance.projectId);
      if (!vendors) {
        vendors = new Set<string>();
        explicitVendorsByProject.set(instance.projectId, vendors);
      }
      vendors.add(instance.vendor);
    }

    await this.discoverImplicitTargets(explicitVendorsByProject);
  }

  /**
   * Synthesizes one implicit target per (project, env) for every vendor with `credentialFields: []` and
   * a `registerBackend` — the additive rule from ADR 0037 (private) §4: a
   * credential-less vendor (e.g. `schedule`, and now `webhook` for a *new* project) never needs the user
   * to create an empty credential instance just to get a `registerBackend` call, but an explicit instance
   * of that vendor (e.g. `webhook`'s pre-existing "Webhook" instances, whose id is baked into public URLs
   * already handed to third parties) always takes priority and keeps producing its own target via
   * `discoverTarget` above instead.
   */
  private async discoverImplicitTargets(
    explicitVendorsByProject: ReadonlyMap<string, ReadonlySet<string>>,
  ): Promise<void> {
    const credentialLessVendors = this.integrations.filter(
      (integration) => integration.credentialFields.length === 0 && integration.registerBackend,
    );
    if (credentialLessVendors.length === 0) return;

    const projectIds = await this.discovery.listProjectIds();
    for (const integration of credentialLessVendors) {
      for (const projectId of projectIds) {
        const hasExplicitInstance = explicitVendorsByProject.get(projectId)?.has(integration.vendor) ?? false;
        for (const env of ['dev', 'prod'] as const) {
          await this.discoverImplicitTarget(integration, projectId, env, hasExplicitInstance);
        }
      }
    }
  }

  /**
   * `credentialId` is the vendor id itself (there is no credential instance to have an id) and `fields`
   * is always `{}` — deliberately never routed through `resolveCredentialFields`, which resolves
   * *credential* fields for a specific instance and has nothing to resolve here.
   */
  private async discoverImplicitTarget(
    integration: IWorkflowIntegration,
    projectId: string,
    env: TEnv,
    hasExplicitInstance: boolean,
  ): Promise<void> {
    const target: IKnownTarget = { vendor: integration.vendor, credentialId: integration.vendor, projectId, env };
    const key = targetKey(target);

    if (hasExplicitInstance) {
      // An explicit instance of this vendor now exists for this project — it produces its own target via
      // discoverTarget above, so forget any implicit one. If the explicit instance is later removed, this
      // makes the implicit target look brand new again next tick (re-gated by activatedProjects below)
      // rather than treated as already-known and skipped.
      this.knownTargets.delete(key);
      this.stoppedTargets.delete(key);
      if (this.activeTargets.has(key)) await this.stopTarget(key);
      return;
    }

    const isNewTarget = !this.knownTargets.has(key);
    this.knownTargets.set(key, target);
    if (isNewTarget && !this.activatedProjects[env].has(projectId)) {
      this.stoppedTargets.add(key);
    }
    if (this.activeTargets.has(key) || this.stoppedTargets.has(key)) return;

    try {
      await this.startTarget(integration, target, {});
    } catch (error) {
      this.logger.error(
        `Failed to register backend for ${target.vendor}/${target.credentialId}/${target.env}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private async discoverTarget(
    integration: IWorkflowIntegration,
    instance: IIntegrationCredentialInstance,
    env: TEnv,
  ): Promise<void> {
    const target: IKnownTarget = {
      vendor: instance.vendor,
      credentialId: instance.instanceId,
      projectId: instance.projectId,
      env,
    };
    const key = targetKey(target);
    const isNewTarget = !this.knownTargets.has(key);
    this.knownTargets.set(key, target);
    if (isNewTarget && !this.activatedProjects[env].has(instance.projectId)) {
      this.stoppedTargets.add(key);
    }
    if (this.activeTargets.has(key) || this.stoppedTargets.has(key)) return;

    const fields = await this.discovery.resolveCredentialFields(
      instance.vendor,
      instance.instanceId,
      env,
      instance.projectId,
    );
    // Not configured for this env yet — leave it out of `activeTargets` so the next discovery tick retries it.
    if (!fields) return;

    try {
      await this.startTarget(integration, target, fields);
    } catch (error) {
      this.logger.error(
        `Failed to register backend for ${target.vendor}/${target.credentialId}/${target.env}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private async startTarget(
    integration: IWorkflowIntegration,
    target: IKnownTarget,
    fields: Readonly<Record<string, string>>,
  ): Promise<void> {
    const registerBackend = integration.registerBackend;
    if (!registerBackend) return;

    const key = targetKey(target);
    const webhookKeys: string[] = [];
    const intervalHandles: NodeJS.Timeout[] = [];
    const taskQueue = this.discovery.taskQueueFor(target.projectId, target.env);
    const webhookUrl = this.publicHost
      ? `${this.publicHost}/webhooks/${target.vendor}/${target.projectId}/${target.credentialId}/${target.env}`
      : null;

    const registerResult = await registerBackend({
      vendor: target.vendor,
      credentialId: target.credentialId,
      projectId: target.projectId,
      env: target.env,
      fields,
      webhookUrl,
      taskQueue,
      registerWebHook: (uri, handler) => {
        const handlerKey = webhookHandlerKey(target.vendor, target.projectId, target.credentialId, target.env, uri);
        this.webhookHandlers.set(handlerKey, handler);
        webhookKeys.push(handlerKey);
      },
      registerInterval: (callback, intervalMs) => {
        let running = false;
        const handle = setInterval(() => {
          if (running) return;
          running = true;
          callback()
            .catch((error: unknown) => {
              this.logger.error(
                `Interval callback failed for ${target.vendor}/${target.credentialId}/${target.env}`,
                error instanceof Error ? error.stack : error,
              );
            })
            .finally(() => {
              running = false;
            });
        }, intervalMs);
        intervalHandles.push(handle);
      },
      signalWorkflow: async (signal) => {
        if (this.ensureRunnerRunning) {
          try {
            await this.ensureRunnerRunning({ projectId: target.projectId, env: target.env, taskQueue });
          } catch (error) {
            // Best-effort: fall through to signaling anyway — no worse than the pre-wake status quo.
            this.logger.error(
              `ensureRunnerRunning failed for ${target.vendor}/${target.credentialId}/${target.env}`,
              error instanceof Error ? error.stack : error,
            );
          }
        }
        await this.signalWorkflowWithStart({
          ...signal,
          taskQueue,
          temporalAddress: this.temporalAddress,
          namespace: this.namespace,
        });
      },
      getDocumentsByType: (type) => this.discovery.getDocumentsByType(target.projectId, type),
      getInternalProjectToken: () => {
        if (!this.getInternalProjectToken) {
          throw new Error('No internal project token source configured for this IntegrationsRuntimeService');
        }
        return this.getInternalProjectToken(target.projectId);
      },
      upsertSchedule: (scheduleParams) =>
        this.requireScheduleClient().upsert({
          ...scheduleParams,
          taskQueue,
          projectId: target.projectId,
          env: target.env,
        }),
      pauseSchedule: (scheduleId, note) => this.requireScheduleClient().pause(scheduleId, note),
      deleteSchedule: (scheduleId) => this.requireScheduleClient().delete(scheduleId),
      listSchedules: () => this.requireScheduleClient().list(taskQueue),
      uploadFile: (source, meta) => this.requireFileUploadPort().upload(target.projectId, source, meta),
    });

    const backendHandle = normalizeBackendHandle(registerResult);
    this.activeTargets.set(key, {
      dispose: backendHandle.dispose,
      onRunnerIdle: backendHandle.onRunnerIdle?.bind(backendHandle),
      onRunnerResume: backendHandle.onRunnerResume?.bind(backendHandle),
      webhookKeys,
      intervalHandles,
    });
  }

  private requireScheduleClient(): IScheduleClientPort {
    if (!this.scheduleClient) {
      throw new Error('No schedule client configured for this IntegrationsRuntimeService');
    }
    return this.scheduleClient;
  }

  private requireFileUploadPort(): IFileUploadPort {
    if (!this.fileUpload) {
      throw new Error('No file upload port configured for this IntegrationsRuntimeService');
    }
    return this.fileUpload;
  }

  private async stopTarget(key: string): Promise<void> {
    const active = this.activeTargets.get(key);
    if (!active) return;
    this.activeTargets.delete(key);
    for (const webhookKey of active.webhookKeys) this.webhookHandlers.delete(webhookKey);
    for (const handle of active.intervalHandles) clearInterval(handle);
    try {
      await active.dispose();
    } catch (error) {
      this.logger.error(`dispose() failed for target ${key}`, error instanceof Error ? error.stack : error);
    }
  }
}
