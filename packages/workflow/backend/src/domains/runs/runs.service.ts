import { ConflictException, NotFoundException } from '@nestjs/common';
import { In, type Repository } from 'typeorm';
import type { ProjectVersion } from '../build/build/project-version.entity.js';
import type { ProjectsService } from '../projects/projects/projects.service.js';

export interface IWorkflowRunEvent {
  readonly id: string;
  readonly time: string | null;
  readonly type: string;
}

/** One execution as reported by Temporal's visibility API, before project/version enrichment. */
export interface IRawWorkflowRun {
  readonly workflowId: string;
  readonly runId: string;
  readonly status: string;
  readonly workflowName: string;
  readonly taskQueue: string;
  /** Worker Deployment build ID that ran the most recent workflow task, if the execution is versioned — see ADR 0004 (private). Unversioned (dev) executions never have one. */
  readonly buildId: string | null;
  readonly startTime: string;
  readonly closeTime: string | null;
}

export interface IRawWorkflowRunDetail extends IRawWorkflowRun {
  readonly input: unknown;
  readonly result: unknown;
  readonly events: readonly IWorkflowRunEvent[];
}

export type TListWorkflowRuns = (params: {
  readonly taskQueues: readonly string[];
  readonly temporalAddress?: string;
  readonly namespace?: string;
}) => Promise<readonly IRawWorkflowRun[]>;

export type TDescribeWorkflowRun = (params: {
  readonly workflowId: string;
  readonly runId: string;
  readonly temporalAddress?: string;
  readonly namespace?: string;
}) => Promise<IRawWorkflowRunDetail>;

export type TTerminateWorkflowRun = (params: {
  readonly workflowId: string;
  readonly runId: string;
  readonly reason: string;
  readonly temporalAddress?: string;
  readonly namespace?: string;
}) => Promise<void>;

export interface IWorkflowRunSummary extends IRawWorkflowRun {
  readonly projectId: string;
  readonly projectName: string;
  readonly env: 'dev' | 'prod';
  /** `'dev'` for the unversioned dev task queue, otherwise the published version number as a string (e.g. `'3'`), or the raw build ID if no matching `ProjectVersion` row is found (e.g. a deleted version). */
  readonly version: string;
}

export interface IWorkflowRunDetail extends IRawWorkflowRunDetail {
  readonly projectId: string;
  readonly projectName: string;
  readonly env: 'dev' | 'prod';
  readonly version: string;
}

export interface IRunsFilters {
  readonly projectId?: string;
  readonly workflowName?: string;
  readonly version?: string;
  readonly buildId?: string;
}

export interface IRunsServiceParams {
  readonly projectsService: Pick<ProjectsService, 'list' | 'getOwnedProject'>;
  readonly versions: Pick<Repository<ProjectVersion>, 'find'>;
  readonly listWorkflowRuns: TListWorkflowRuns;
  readonly describeWorkflowRun: TDescribeWorkflowRun;
  /** Optional so existing constructions (tests, tools) that never terminate need not supply it. */
  readonly terminateWorkflowRun?: TTerminateWorkflowRun;
  readonly temporalAddress?: string;
  readonly namespace?: string;
}

const DEV_TASK_QUEUE_PREFIX = 'workflow-dev-';
const PROD_TASK_QUEUE_PREFIX = 'workflow-';

interface IParsedTaskQueue {
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
}

/** `workflow-dev-<projectId>` / `workflow-<projectId>` — see `BuildService`'s `devTaskQueue`/`prodTaskQueue`. */
const parseTaskQueue = (taskQueue: string): IParsedTaskQueue | null => {
  if (taskQueue.startsWith(DEV_TASK_QUEUE_PREFIX)) {
    return { projectId: taskQueue.slice(DEV_TASK_QUEUE_PREFIX.length), env: 'dev' };
  }
  if (taskQueue.startsWith(PROD_TASK_QUEUE_PREFIX)) {
    return { projectId: taskQueue.slice(PROD_TASK_QUEUE_PREFIX.length), env: 'prod' };
  }
  return null;
};

/**
 * Reads workflow executions straight from Temporal's own visibility store — there is no local
 * "runs" table, this is a read-through view. Scoped to the requesting user by first resolving
 * their owned projects into task queues (`workflow[-dev]-<projectId>`), never by trusting a
 * client-supplied project id. Constructed manually (see `runs.module.ts`), same pattern as
 * `WorkflowRunService`/`DeploymentCliService` — the Temporal-calling functions are injected as
 * plain closures rather than Nest-managed providers, which keeps this class trivially unit-testable.
 */
export class RunsService {
  private readonly projectsService: Pick<ProjectsService, 'list' | 'getOwnedProject'>;
  private readonly versions: Pick<Repository<ProjectVersion>, 'find'>;
  private readonly listWorkflowRuns: TListWorkflowRuns;
  private readonly describeWorkflowRun: TDescribeWorkflowRun;
  private readonly terminateWorkflowRun: TTerminateWorkflowRun | undefined;
  private readonly temporalAddress: string | undefined;
  private readonly namespace: string | undefined;

  constructor(params: IRunsServiceParams) {
    this.projectsService = params.projectsService;
    this.versions = params.versions;
    this.listWorkflowRuns = params.listWorkflowRuns;
    this.describeWorkflowRun = params.describeWorkflowRun;
    this.terminateWorkflowRun = params.terminateWorkflowRun;
    this.temporalAddress = params.temporalAddress;
    this.namespace = params.namespace;
  }

  /**
   * All filtering happens here, not in the client — `projectId` narrows which task queues are even
   * queried (and, since it's checked against the caller's own owned projects, doubles as an
   * ownership check: an unowned or unknown id simply yields no task queues, hence no results).
   * `workflowName`/`version`/`buildId` are applied after enrichment since they aren't real Temporal
   * visibility fields (`version` in particular is this app's own derived concept, see `resolveVersion`).
   */
  async listRuns(ownerId: string, filters: IRunsFilters = {}): Promise<IWorkflowRunSummary[]> {
    const ownedProjects = await this.projectsService.list(ownerId);
    const projects = filters.projectId
      ? ownedProjects.filter((project) => project.id === filters.projectId)
      : ownedProjects;
    if (projects.length === 0) return [];

    const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
    const taskQueues = projects.flatMap((project) => [`workflow-dev-${project.id}`, `workflow-${project.id}`]);
    const versionNumberByProjectAndBuild = await this.buildVersionLookup(projects.map((project) => project.id));

    const raw = await this.listWorkflowRuns({
      taskQueues,
      temporalAddress: this.temporalAddress,
      namespace: this.namespace,
    });

    return raw
      .map((run) => this.enrich(run, projectNameById, versionNumberByProjectAndBuild))
      .filter(
        (run) =>
          (!filters.workflowName || run.workflowName === filters.workflowName) &&
          (!filters.version || run.version === filters.version) &&
          (!filters.buildId || run.buildId === filters.buildId),
      );
  }

  async getRunDetail(ownerId: string, workflowId: string, runId: string): Promise<IWorkflowRunDetail> {
    const detail = await this.describeWorkflowRun({
      workflowId,
      runId,
      temporalAddress: this.temporalAddress,
      namespace: this.namespace,
    });

    const parsed = parseTaskQueue(detail.taskQueue);
    if (!parsed) throw new NotFoundException(`Workflow run "${workflowId}" is not owned by any project`);
    // Throws 404 if `parsed.projectId` isn't owned by `ownerId` — never leaks a run's existence to a non-owner.
    const project = await this.projectsService.getOwnedProject(parsed.projectId, ownerId);
    const versionNumberByProjectAndBuild = await this.buildVersionLookup([project.id]);

    return {
      ...detail,
      projectId: project.id,
      projectName: project.name,
      env: parsed.env,
      version: this.resolveVersion(parsed, detail.buildId, versionNumberByProjectAndBuild),
    };
  }

  /**
   * Force-terminates one open execution of `projectId` (owner-scoped; a run of another project, or one
   * the caller doesn't own, is a 404). Already-closed runs are a 409 — Temporal would reject them anyway.
   */
  async terminateRun(ownerId: string, projectId: string, workflowId: string, runId: string): Promise<void> {
    if (!this.terminateWorkflowRun) throw new Error('Terminating runs is not configured');
    await this.projectsService.getOwnedProject(projectId, ownerId);
    const detail = await this.describeWorkflowRun({
      workflowId,
      runId,
      temporalAddress: this.temporalAddress,
      namespace: this.namespace,
    });
    const parsed = parseTaskQueue(detail.taskQueue);
    if (parsed?.projectId !== projectId) {
      throw new NotFoundException(`Workflow run "${workflowId}" does not belong to this project`);
    }
    if (detail.status !== 'RUNNING') {
      throw new ConflictException(`Workflow run "${workflowId}" is not running (status ${detail.status})`);
    }
    await this.terminateWorkflowRun({
      workflowId,
      runId,
      reason: 'terminated by the project owner',
      temporalAddress: this.temporalAddress,
      namespace: this.namespace,
    });
  }

  private async buildVersionLookup(projectIds: readonly string[]): Promise<Map<string, number>> {
    const versions = await this.versions.find({ where: { projectId: In([...projectIds]) } });
    return new Map(versions.map((version) => [`${version.projectId}:${version.buildId}`, version.versionNumber]));
  }

  private enrich(
    run: IRawWorkflowRun,
    projectNameById: Map<string, string>,
    versionNumberByProjectAndBuild: Map<string, number>,
  ): IWorkflowRunSummary {
    const parsed = parseTaskQueue(run.taskQueue);
    const projectId = parsed?.projectId ?? '';
    const env = parsed?.env ?? 'prod';
    return {
      ...run,
      projectId,
      projectName: projectNameById.get(projectId) ?? projectId,
      env,
      version: this.resolveVersion(parsed, run.buildId, versionNumberByProjectAndBuild),
    };
  }

  private resolveVersion(
    parsed: IParsedTaskQueue | null,
    buildId: string | null,
    versionNumberByProjectAndBuild: Map<string, number>,
  ): string {
    if (!parsed || parsed.env === 'dev') return 'dev';
    if (!buildId) return 'unknown';
    const versionNumber = versionNumberByProjectAndBuild.get(`${parsed.projectId}:${buildId}`);
    return typeof versionNumber === 'number' ? String(versionNumber) : buildId;
  }
}
