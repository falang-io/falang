// oxlint-disable max-lines -- over the default cap because of `onModuleInit`'s new `ensureRunnerRunning` wiring (ADR 0016 (private)'s Phase 2 "Scale-to-zero" follow-up); the constructor's already-long DI list (unchanged) accounts for most of the file, not accumulated complexity.
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getFunctionSignature, type IFunctionSignature } from '@falang/workflow-compiler';
import { IntegrationsRuntimeService, SCHEDULE_CLIENT_PORT, type IScheduleClientPort } from '@falang/workflow-gateway';
import type { Repository } from 'typeorm';
import { UserLimitsService } from '../../admin/user-limits/user-limits.service.js';
import { FilesService } from '../../files/files.service.js';
import { ActivepiecesCatalogService } from '../../integrations/activepieces-catalog.service.js';
import { ProjectTokenService } from '../../internal-auth/project-token.service.js';
import { DocumentsService } from '../../projects/documents/documents.service.js';
import { ProjectsService } from '../../projects/projects/projects.service.js';
import { VersioningService } from '../../projects/versioning/versioning.service.js';
import { toApiSchedule, type IApiSchedule } from './api-schedule.js';
import { buildArtifact, cleanupOrphanedBuildDirs, typeCheckInWorker } from './build-artifact.js';
import {
  compileProjectStructure,
  getIntegrationsForCompile,
  toGeneratedFiles,
  type IGeneratedFile,
} from './compile-project-documents.js';
import { DeploymentCliService } from './deployment-cli.service.js';
import { DevArtifactStore } from './dev-artifact-store.service.js';
import type { TRunTarget } from './dto/run-function.dto.js';
import {
  ensureRunnerRunning,
  type IEnsureRunnerRunningDeps,
  type IEnsureRunnerRunningOptions,
} from './ensure-runner-running.js';
import { assertUnderProdVersionLimit, resolveProdVersionLimit } from './prod-version-limit.js';
import { ProjectVersion } from './project-version.entity.js';
import { toVersionSummary, type IProjectVersionSummary } from './project-version-summary.js';
import { startAndRouteProdVersion, type IRouteProdVersionDeps } from './route-prod-version.js';
import { RunnerProcessManager } from './runner-process-manager.js';
import { resolveStartDeliveryArgs, type IStartDeliveryResolution } from './start-delivery-args.js';
import { devTaskQueue, prodTaskQueue } from './task-queue-names.js';
import type { IWorkflowPosition } from './workflow-position.js';
import type { IRunFunctionResult, IStartedRun } from './workflow-run.service.js';
import { WorkflowRunService } from './workflow-run.service.js';

export const BUILD_OUTPUT_DIR = Symbol('BUILD_OUTPUT_DIR');
/** Per-project cap on concurrently-running prod versions — app-level, not a k8s `ResourceQuota` (see `prod-version-limit.ts`). */

export interface IBuildResult {
  readonly projectId: string;
  /** Unique per workflow definition — see ADR 0002 (private). */
  readonly taskQueue: string;
  /** How many still-open executions were terminated to make way for this build — see `WorkflowRunService.terminateRunningOn`. */
  readonly terminatedExecutionsCount: number;
}

export interface IProjectFunctionSignature extends IFunctionSignature {
  readonly name: string;
}

export interface IStartedDevRun extends IStartedRun {
  /** How many still-open dev executions were terminated to make way for this one — see `startDevRun`. */
  readonly terminatedExecutionsCount: number;
}

/**
 * Compiles a project's `function` documents into a workflow bundle and its backing Activity
 * implementations, and starts a k8s runner pod (`RunnerProcessManager`) that fetches that artifact
 * over HTTP at startup — see ADR 0016 (private)'s "Artifact delivery into the runner pod". Dev
 * (`build`/`stop`) reflects the live, currently-edited documents on an unversioned task queue, its
 * artifact held in memory only. Publishing persists the artifact on `ProjectVersion` so multiple
 * versions can coexist on the stable prod task queue — see ADR 0004 (private).
 */
@Injectable()
export class BuildService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(BuildService.name);
  private readonly documentsService: DocumentsService;
  private readonly projectsService: ProjectsService;
  private readonly runnerProcessManager: RunnerProcessManager;
  private readonly deploymentCli: DeploymentCliService;
  private readonly workflowRunService: WorkflowRunService;
  private readonly gatewayRuntime: IntegrationsRuntimeService;
  private readonly scheduleClient: IScheduleClientPort;
  private readonly activepiecesCatalog: ActivepiecesCatalogService;
  private readonly devArtifacts: DevArtifactStore;
  private readonly projectTokens: ProjectTokenService;
  private readonly versioning: VersioningService;
  private readonly versions: Repository<ProjectVersion>;
  private readonly outputDir: string;
  private readonly userLimits: UserLimitsService;
  private readonly filesService: FilesService;

  constructor(
    @Inject(DocumentsService) documentsService: DocumentsService,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(RunnerProcessManager) runnerProcessManager: RunnerProcessManager,
    @Inject(DeploymentCliService) deploymentCli: DeploymentCliService,
    @Inject(WorkflowRunService) workflowRunService: WorkflowRunService,
    @Inject(IntegrationsRuntimeService) gatewayRuntime: IntegrationsRuntimeService,
    @Inject(SCHEDULE_CLIENT_PORT) scheduleClient: IScheduleClientPort,
    @Inject(ActivepiecesCatalogService) activepiecesCatalog: ActivepiecesCatalogService,
    @Inject(DevArtifactStore) devArtifacts: DevArtifactStore,
    @Inject(ProjectTokenService) projectTokens: ProjectTokenService,
    @Inject(VersioningService) versioning: VersioningService,
    @InjectRepository(ProjectVersion) versions: Repository<ProjectVersion>,
    @Inject(BUILD_OUTPUT_DIR) outputDir: string,
    @Inject(UserLimitsService) userLimits: UserLimitsService,
    @Inject(FilesService) filesService: FilesService,
  ) {
    this.documentsService = documentsService;
    this.projectsService = projectsService;
    this.runnerProcessManager = runnerProcessManager;
    this.deploymentCli = deploymentCli;
    this.workflowRunService = workflowRunService;
    this.gatewayRuntime = gatewayRuntime;
    this.scheduleClient = scheduleClient;
    this.activepiecesCatalog = activepiecesCatalog;
    this.devArtifacts = devArtifacts;
    this.projectTokens = projectTokens;
    this.versioning = versioning;
    this.versions = versions;
    this.outputDir = outputDir;
    this.userLimits = userLimits;
    this.filesService = filesService;
  }

  /**
   * Wires `ensureRunnerRunning` into `IntegrationsRuntimeService` via its post-construction setter,
   * not `GatewayModule.forRootAsync`'s constructor-time hooks (`resolveInternalProjectToken`'s
   * pattern) — `BuildService` already depends on `IntegrationsRuntimeService` itself, so threading
   * the reverse hook through the constructor would be circular. See ADR 0016 (private)'s Phase 2
   * "Scale-to-zero" follow-up.
   */
  onModuleInit(): void {
    // A crashed previous process may have left per-build directories behind (`buildArtifact` cleans up in `finally`).
    cleanupOrphanedBuildDirs(this.outputDir);
    const deps = this.ensureRunnerDeps();
    this.gatewayRuntime.setEnsureRunnerRunning((params) =>
      ensureRunnerRunning(deps, params.projectId, params.env, params.taskQueue),
    );
  }

  /**
   * Restores vendor ingress the gateway only keeps in memory: prod for every project whose production
   * is turned on (`Project.prodEnabled`), dev for every project with a live dev runner pod. Without it,
   * a `backend` restart leaves running bots deaf until someone presses Stop/Start. A prod pod still
   * running for a project without the flag (started before the column existed) adopts the flag.
   * Runs in the background so an unreachable cluster never delays boot.
   */
  onApplicationBootstrap(): void {
    this.restoreIngress().catch((error: unknown) => {
      this.logger.error('Failed to restore integrations ingress on boot', error instanceof Error ? error.stack : error);
    });
  }

  private async restoreIngress(): Promise<void> {
    const prodProjects = new Set(await this.projectsService.listProdEnabledIds());
    const running = await this.runnerProcessManager.listRunning().catch((error: unknown) => {
      this.logger.error('Could not list runner pods on boot', error instanceof Error ? error.stack : error);
      return [];
    });
    const legacyProd = new Set(
      running.filter((runner) => runner.env === 'prod' && !prodProjects.has(runner.projectId)).map((runner) => runner.projectId),
    );
    const adopted = await Promise.all(
      Array.from(legacyProd, async (projectId) => ((await this.projectsService.setProdEnabled(projectId, true)) ? projectId : null)),
    );
    for (const projectId of adopted) if (projectId) prodProjects.add(projectId);
    for (const projectId of prodProjects) this.gatewayRuntime.resumeProjectIntegrations(projectId, 'prod');
    const devProjects = new Set(running.filter((runner) => runner.env === 'dev').map((runner) => runner.projectId));
    for (const projectId of devProjects) this.gatewayRuntime.resumeProjectIntegrations(projectId, 'dev');
  }

  /** Also used by `DebugService` (via `build.module.ts`'s factory provider) — a debug session's `ensureRunnerRunning` call is always `env: 'dev'`, which never touches `versions`/`deploymentCli`/`startVersionRunnerIfNeeded` below, but the shared helper's signature wants the full deps shape regardless. */
  ensureRunnerDeps(): IEnsureRunnerRunningDeps {
    return {
      runnerProcessManager: this.runnerProcessManager,
      devArtifacts: this.devArtifacts,
      projectTokens: this.projectTokens,
      versions: this.versions,
      deploymentCli: this.deploymentCli,
      startVersionRunnerIfNeeded: this.startVersionRunnerIfNeeded.bind(this),
    };
  }

  /**
   * Public wrapper around the shared `ensureRunnerRunning` helper, reusing this service's own
   * `ensureRunnerDeps()` — for callers outside this module that don't construct
   * `IEnsureRunnerRunningDeps` themselves, currently `ScheduleWakeService`'s wake sweep (ADR 0037 (private) §5/§6).
   */
  ensureRunnerRunning(
    projectId: string,
    env: 'dev' | 'prod',
    taskQueue: string,
    options?: IEnsureRunnerRunningOptions,
  ): Promise<void> {
    return ensureRunnerRunning(this.ensureRunnerDeps(), projectId, env, taskQueue, options);
  }

  async build(projectId: string, ownerId: string): Promise<IBuildResult> {
    // `listFull` authorizes internally (throws 404 if the project isn't owned by `ownerId`).
    const documents = await this.documentsService.listFull(projectId, ownerId);
    // Dev builds are always debug-instrumented (ADR 0021 (private) §5) — the cost is a no-op per
    // statement until a debug session actually attaches, and it means toggling a breakpoint never
    // needs a rebuild. `debugMap` is kept alongside the artifact for `DebugService` to resolve
    // node ids to trace indexes.
    const { workflows, activities, debugMap } = compileProjectStructure(
      documents,
      await getIntegrationsForCompile(this.activepiecesCatalog),
      { debug: true },
    );

    const { workflowBundle, activitiesSource } = await buildArtifact(this.outputDir, workflows, activities);
    this.devArtifacts.set(projectId, { workflowBundle, activitiesSource, debugMap });

    const taskQueue = devTaskQueue(projectId);
    const terminatedExecutionsCount = await this.workflowRunService.terminateRunningOn(projectId, taskQueue);
    await this.runnerProcessManager.start({
      taskQueue,
      projectId,
      internalProjectToken: this.projectTokens.getOrCreateToken(projectId),
      workflowEnv: 'dev',
    });
    // A previous `stop()` may have parked this project's dev credentials (e.g. a Telegram bot) —
    // resume their ingress now that the dev runner is back up, see `IntegrationsRuntimeService`.
    this.gatewayRuntime.resumeProjectIntegrations(projectId, 'dev');
    return { projectId, taskQueue, terminatedExecutionsCount };
  }

  async stop(projectId: string, ownerId: string): Promise<void> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    await this.runnerProcessManager.stop(devTaskQueue(projectId));
    // Stopping the runner pod only stops workflow execution — vendor polling (e.g. Telegram's
    // long-poll `getUpdates` loop) lives in the backend's own `IntegrationsRuntimeService` and is
    // otherwise unaffected by it, so it must be told separately to stop for this project's dev env.
    this.gatewayRuntime.stopProjectIntegrations(projectId, 'dev');
  }

  /** Whether the dev runner is live — restores the client's Build/Stop state on page load instead of assuming "not built" until the next manual Build click. */
  async getDevStatus(projectId: string, ownerId: string): Promise<{ running: boolean; taskQueue: string }> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const taskQueue = devTaskQueue(projectId);
    return { running: await this.runnerProcessManager.isRunning(taskQueue), taskQueue };
  }

  /** Compiles the project the same way `build()` does, but only for preview: no artifact is built and no runner is started. One entry per generated module. */
  async generateCode(projectId: string, ownerId: string): Promise<IGeneratedFile[]> {
    const documents = await this.documentsService.listFull(projectId, ownerId);
    const { workflows, activities } = compileProjectStructure(
      documents,
      await getIntegrationsForCompile(this.activepiecesCatalog),
      { trackPosition: false },
    );
    await typeCheckInWorker(workflows, activities);
    return toGeneratedFiles(workflows, activities);
  }

  /** Lists every function document's name, parameters, and return type — for the editor's manual-run form. */
  async listFunctions(projectId: string, ownerId: string): Promise<IProjectFunctionSignature[]> {
    const documents = await this.documentsService.listFull(projectId, ownerId);
    const signatures: IProjectFunctionSignature[] = [];
    for (const document of documents) {
      if (document.type !== 'function' || !document.root) continue;
      const { parameters, returnValue } = getFunctionSignature(document.root);
      signatures.push({ name: document.name, parameters, returnValue });
    }
    return signatures;
  }

  /**
   * Starts one ad-hoc execution of a function document and waits for its result — the editor's
   * "Run" button. `target: 'dev'` needs `build()` to have run first; `target: 'published'` runs
   * against the stable prod task queue, routed to whichever version is active (see `activate`).
   */
  async run(
    projectId: string,
    ownerId: string,
    input: { readonly functionName: string; readonly target: TRunTarget; readonly args: readonly unknown[] },
  ): Promise<IRunFunctionResult> {
    const documents = await this.documentsService.listFull(projectId, ownerId);
    const exists = documents.some((document) => document.type === 'function' && document.name === input.functionName);
    if (!exists) {
      throw new NotFoundException(`Function "${input.functionName}" not found in project "${projectId}"`);
    }

    const taskQueue = input.target === 'dev' ? devTaskQueue(projectId) : prodTaskQueue(projectId);
    this.runnerProcessManager.touch(taskQueue);
    return this.workflowRunService.run(projectId, taskQueue, input.functionName, input.args);
  }

  /**
   * The toolbar's "Run" button (ADR 0022 (private)): starts one execution of a function document
   * on the dev task queue and returns its ids right away — the client follows it via
   * `getRunPosition`. Requires a dev build (`build()`) to exist; the runner pod is (re)started if
   * it was idle-scaled down. Every other open dev execution is terminated first, per the product
   * rule that the dev stand runs one thing at a time — the same reason `build()` terminates them.
   *
   * Also serves as "Run now" for a `trigger-function` bound to a `delivery: 'start'` trigger (e.g. a
   * `schedule-*` trigger — ADR 0037 (private) §7): `resolveStartDeliveryArgs`
   * decides whether `input.functionName` is runnable at all this way and, for such a trigger-function,
   * synthesizes the `fire` payload instead of using the client's own `input.args` (a plain `function`
   * document is unaffected — its `input.args` pass through unchanged). A `delivery: 'signal'`
   * trigger-function (Telegram, webhook, …) is rejected the same way it always was.
   */
  async startDevRun(
    projectId: string,
    ownerId: string,
    input: { readonly functionName: string; readonly args: readonly unknown[]; readonly triggerPayload?: unknown },
  ): Promise<IStartedDevRun> {
    const { resolution } = await this.resolveRunEntry(projectId, ownerId, input);
    if (!this.devArtifacts.has(projectId)) {
      throw new ConflictException('Build the project first — there is no dev build to run');
    }

    const taskQueue = devTaskQueue(projectId);
    await ensureRunnerRunning(this.ensureRunnerDeps(), projectId, 'dev', taskQueue);
    const terminatedExecutionsCount = await this.workflowRunService.terminateRunningOn(projectId, taskQueue);
    const started = await this.workflowRunService.start(
      projectId,
      taskQueue,
      input.functionName,
      resolution.args ?? input.args,
      resolution.signal,
    );
    return { ...started, terminatedExecutionsCount };
  }

  /**
   * Finds the document a dev run/debug session starts and how (`resolveStartDeliveryArgs`): a plain
   * function with the client's args, a schedule trigger with a synthesized `fire`, a signal-delivery
   * trigger with the user's test payload sent as its signal. 404 for an unknown/unrunnable document,
   * 400 for a signal trigger started without a payload.
   */
  async resolveRunEntry(
    projectId: string,
    ownerId: string,
    input: { readonly functionName: string; readonly args: readonly unknown[]; readonly triggerPayload?: unknown },
  ): Promise<{ readonly resolution: IStartDeliveryResolution }> {
    const documents = await this.documentsService.listFull(projectId, ownerId);
    const document = documents.find((candidate) => candidate.name === input.functionName);
    const integrations = document ? await getIntegrationsForCompile(this.activepiecesCatalog) : [];
    const resolution: IStartDeliveryResolution = document
      ? resolveStartDeliveryArgs(document, integrations, input.args, input.triggerPayload)
      : { runnable: false };
    if (!document || !resolution.runnable) {
      if (document && resolution.reason) throw new BadRequestException(resolution.reason);
      throw new NotFoundException(`Function "${input.functionName}" not found in project "${projectId}"`);
    }
    return { resolution };
  }

  /** Backs `GET /projects/:id/schedules` — every Temporal Schedule reconciled for this project's `trigger-function` documents, dev and prod alike. See ADR 0037 (private) §7. */
  async listSchedules(projectId: string, ownerId: string): Promise<IApiSchedule[]> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const schedules = await this.scheduleClient.listForProject(projectId);
    return schedules
      .map((schedule) => toApiSchedule(schedule))
      .filter((schedule): schedule is IApiSchedule => schedule !== null);
  }

  /**
   * Where one of this project's executions (dev or prod) currently is in its diagram — see
   * `IWorkflowPosition`. Ownership is checked against the execution's *own* task queue (never a
   * client-supplied one), the same "don't leak existence to non-owners" rule `RunsService` follows.
   * Polling this counts as activity for the idle sweep, and an `'unavailable'` answer on a running
   * execution kicks `ensureRunnerRunning` so the next poll finds the pod back up.
   */
  async getRunPosition(
    projectId: string,
    ownerId: string,
    workflowId: string,
    runId: string,
  ): Promise<IWorkflowPosition> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const position = await this.workflowRunService.getPosition(projectId, workflowId, runId);
    const env = ((): 'dev' | 'prod' | null => {
      if (position?.taskQueue === devTaskQueue(projectId)) return 'dev';
      if (position?.taskQueue === prodTaskQueue(projectId)) return 'prod';
      return null;
    })();
    if (!position || !env) {
      throw new NotFoundException(`Workflow run "${workflowId}" not found in project "${projectId}"`);
    }
    this.runnerProcessManager.touch(position.taskQueue);
    if (position.source === 'unavailable') {
      await ensureRunnerRunning(this.ensureRunnerDeps(), projectId, env, position.taskQueue);
    }
    return position;
  }

  /**
   * Compiles the project's current documents into a new, immutable published version and persists
   * it. Doesn't start a runner by itself, except if prod is already running, in which case this
   * version starts alongside it (subject to the owner's `maxConcurrentProdVersions` limit) — see `startProd`.
   */
  async publish(projectId: string, ownerId: string): Promise<IProjectVersionSummary> {
    const versionNumber = (await this.versions.count({ where: { projectId } })) + 1;

    // One commit per publish (ADR 0025 (private), "Ties to ProjectVersion") —
    // reuses `HEAD` untouched (no new commit) when the working copy hasn't changed since the last
    // one, e.g. two publishes back to back with no edit in between.
    const commit =
      (await this.versioning.commit(projectId, ownerId, { kind: 'named', message: `Publish v${versionNumber}` })) ??
      (await this.versioning.headCommit(projectId, ownerId));

    const documents = await this.documentsService.listFull(projectId, ownerId);
    const { workflows, activities } = compileProjectStructure(
      documents,
      await getIntegrationsForCompile(this.activepiecesCatalog),
    );

    const buildId = `v${versionNumber}`;
    const { workflowBundle, activitiesSource } = await buildArtifact(this.outputDir, workflows, activities);

    const version = await this.versions.save(
      this.versions.create({
        projectId,
        versionNumber,
        buildId,
        workflowBundle,
        activitiesSource,
        commitId: commit?.id ?? null,
      }),
    );

    const taskQueue = prodTaskQueue(projectId);
    if (await this.runnerProcessManager.isAnyRunning(taskQueue)) {
      await startAndRouteProdVersion(this.routeProdVersionDeps(projectId, taskQueue), projectId, taskQueue, buildId);
    }

    return toVersionSummary(version);
  }

  async listVersions(projectId: string, ownerId: string): Promise<IProjectVersionSummary[]> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const versions = await this.versions.find({ where: { projectId }, order: { versionNumber: 'ASC' } });
    return versions.map((version) => toVersionSummary(version));
  }

  /**
   * Rolls back to (or re-activates) an already-published version, respawning its runner pod from its
   * immutable artifact if it isn't already running. Turns production on like `startProd` does — a
   * live, routed prod version with its ingress parked would look running while nothing reaches it.
   */
  async activate(projectId: string, ownerId: string, versionNumber: number): Promise<void> {
    const version = await this.getOwnedVersion(projectId, ownerId, versionNumber);
    const taskQueue = prodTaskQueue(projectId);
    await startAndRouteProdVersion(this.routeProdVersionDeps(projectId, taskQueue), projectId, taskQueue, version.buildId);
    await this.turnProdOn(projectId);
  }

  /** Explicitly retires a published version's runner pod. No drainage check — see ADR 0004 (private)'s open follow-ups. */
  async stopVersion(projectId: string, ownerId: string, versionNumber: number): Promise<void> {
    const version = await this.getOwnedVersion(projectId, ownerId, versionNumber);
    await this.runnerProcessManager.stopVersion(prodTaskQueue(projectId), version.buildId);
  }

  /**
   * Whether production is turned on — backs the client's Start/Stop toggle. The persisted flag, not
   * "a pod is running": an idle prod pod is scaled to zero and woken by its triggers, so its absence
   * doesn't mean prod is off, and a pod alone doesn't mean its ingress is on.
   */
  async isProdRunning(projectId: string, ownerId: string): Promise<boolean> {
    const project = await this.projectsService.getOwnedProject(projectId, ownerId);
    return project.prodEnabled;
  }

  /** The project-wide "Start" toggle: starts only the latest published version, and resumes any prod-env vendor polling (e.g. Telegram) parked by a previous `stopProd()`. */
  async startProd(projectId: string, ownerId: string): Promise<void> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const latest = await this.versions.findOne({ where: { projectId }, order: { versionNumber: 'DESC' } });
    if (!latest) throw new NotFoundException(`Project "${projectId}" has no published versions`);

    const taskQueue = prodTaskQueue(projectId);
    await startAndRouteProdVersion(this.routeProdVersionDeps(projectId, taskQueue), projectId, taskQueue, latest.buildId);
    await this.turnProdOn(projectId);
  }

  /** The project-wide "Stop" toggle: stops every published version's runner pod together (see `RunnerProcessManager.stopAll`) and parks prod-env vendor polling. */
  async stopProd(projectId: string, ownerId: string): Promise<void> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    await this.runnerProcessManager.stopAll(prodTaskQueue(projectId));
    await this.projectsService.setProdEnabled(projectId, false);
    this.gatewayRuntime.stopProjectIntegrations(projectId, 'prod');
  }

  /** Deletes a published version's row. Only allowed while prod is fully stopped, matching the user's requirement — otherwise the immutable artifact a live runner pod was started from could be pulled out from under it. */
  async deleteVersion(projectId: string, ownerId: string, versionNumber: number): Promise<void> {
    const version = await this.getOwnedVersion(projectId, ownerId, versionNumber);
    const project = await this.projectsService.getOwnedProject(projectId, ownerId);
    if (project.prodEnabled || (await this.runnerProcessManager.isAnyRunning(prodTaskQueue(projectId)))) {
      throw new ConflictException('Stop the published workflow before deleting versions');
    }
    await this.versions.remove(version);
  }

  /** The project *owner's* cap (`UserLimitsService`: per-user override, else `MAX_CONCURRENT_PROD_VERSIONS`), same owner-not-caller rule as `FilesService`. */
  private getMaxConcurrentProdVersions(projectId: string): Promise<number> {
    return resolveProdVersionLimit(this.projectsService, this.userLimits, projectId);
  }

  /** Shared by `activate`/`startProd`: (re)spawns a version's runner pod, fetching its immutable artifact from `ProjectVersion` at pod start, unless it's already running. */
  private async startVersionRunnerIfNeeded(
    projectId: string,
    taskQueue: string,
    version: Pick<ProjectVersion, 'buildId'>,
  ): Promise<void> {
    if (await this.runnerProcessManager.isRunning(taskQueue, version.buildId)) return;
    await assertUnderProdVersionLimit(
      this.runnerProcessManager,
      taskQueue,
      await this.getMaxConcurrentProdVersions(projectId),
    );
    await this.runnerProcessManager.start({
      taskQueue,
      projectId,
      internalProjectToken: this.projectTokens.getOrCreateToken(projectId),
      buildId: version.buildId,
      workflowEnv: 'prod',
    });
  }

  /** Persists production as on and resumes its prod-env vendor ingress (e.g. Telegram polling) parked by a previous `stopProd()`. */
  private async turnProdOn(projectId: string): Promise<void> {
    await this.projectsService.setProdEnabled(projectId, true);
    this.gatewayRuntime.resumeProjectIntegrations(projectId, 'prod');
  }

  private routeProdVersionDeps(projectId: string, taskQueue: string): IRouteProdVersionDeps {
    return {
      runnerProcessManager: this.runnerProcessManager,
      deploymentCli: this.deploymentCli,
      startRunner: (buildId) => this.startVersionRunnerIfNeeded(projectId, taskQueue, { buildId }),
    };
  }

  private async getOwnedVersion(projectId: string, ownerId: string, versionNumber: number): Promise<ProjectVersion> {
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const version = await this.versions.findOneBy({ projectId, versionNumber });
    if (!version) throw new NotFoundException(`Version ${versionNumber} of project "${projectId}" not found`);
    return version;
  }

  /**
   * Deletes a project outright: stops its dev and every published version's runner pod, parks both
   * envs' vendor polling, drops its `project_versions` rows (no FK to cascade via, unlike
   * documents/folders), then removes the project row. No "stopped first" guard like `deleteVersion`.
   */
  async deleteProject(projectId: string, ownerId: string): Promise<void> {
    await this.projectsService.getOwnedProject(projectId, ownerId);

    await this.runnerProcessManager.stop(devTaskQueue(projectId));
    this.gatewayRuntime.stopProjectIntegrations(projectId, 'dev');

    await this.runnerProcessManager.stopAll(prodTaskQueue(projectId));
    this.gatewayRuntime.stopProjectIntegrations(projectId, 'prod');

    // Timers must stop firing now, not when the (24 h-delayed, ADR 0057 (private)) namespace sweep
    // finally deletes the project's Temporal namespace. Best-effort: Temporal being down must not block deletion.
    await this.scheduleClient.deleteAllForProject(projectId).catch((error: unknown) => {
      this.logger.error(`Failed to delete schedules of deleted project ${projectId}`, error instanceof Error ? error.stack : error);
    });

    await this.versions.delete({ projectId });
    // Removes the project's S3 objects before the row itself goes away — `files.project_id`'s FK
    // cascade would clean up the `files` rows regardless, but never the S3 objects (see
    // ADR 0038 (private) §2).
    await this.filesService.removeProjectFiles(projectId);
    await this.projectsService.delete(projectId, ownerId);
  }
}
