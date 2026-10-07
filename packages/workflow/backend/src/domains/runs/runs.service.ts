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
  /**
   * Worker Deployment build ID that ran the most recent workflow task, if the execution is versioned — see ADR 0004 (private).
   * Unversioned (dev) executions never have one. Visibility list rows carry no `versioningInfo`, so there it comes from the
   * `TemporalWorkerDeploymentVersion` search attribute (`deployment-version.ts`).
   */
  readonly buildId: string | null;
  readonly startTime: string;
  readonly closeTime: string | null;
}

export interface IRawWorkflowRunDetail extends IRawWorkflowRun {
  readonly input: unknown;
  readonly result: unknown;
  readonly events: readonly IWorkflowRunEvent[];
}

/** `projectId` only selects the namespace (any project of the group will do — they share one); an unknown namespace yields no runs. */
export type TListWorkflowRuns = (params: {
  readonly projectId: string;
  readonly taskQueues: readonly string[];
}) => Promise<readonly IRawWorkflowRun[]>;

/** `null` when the execution (or its namespace) doesn't exist in `projectId`'s namespace. */
export type TDescribeWorkflowRun = (params: {
  readonly projectId: string;
  readonly workflowId: string;
  readonly runId: string;
}) => Promise<IRawWorkflowRunDetail | null>;

export type TTerminateWorkflowRun = (params: {
  readonly projectId: string;
  readonly workflowId: string;
  readonly runId: string;
  readonly reason: string;
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
  /** Which Temporal namespace a project's runs live in — `ITemporalTenancy.namespaceFor` (ADR 0057 (private)). */
  readonly tenancy: { namespaceFor(projectId: string): string };
  /** Optional so existing constructions (tests, tools) that never terminate need not supply it. */
  readonly terminateWorkflowRun?: TTerminateWorkflowRun;
}

/** How many namespaces a cross-project listing queries at once. */
export const RUNS_QUERY_CONCURRENCY = 8;
/** Cap on the merged result of one `listRuns` call. */
export const RUNS_LIST_LIMIT = 300;

/** `Promise.all(items.map(fn))`, at most `limit` calls in flight; results keep input order. */
const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- each worker drains the shared queue one item at a time; that is the concurrency limit.
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
};

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
  private readonly tenancy: IRunsServiceParams['tenancy'];
  private readonly terminateWorkflowRun: TTerminateWorkflowRun | undefined;

  constructor(params: IRunsServiceParams) {
    this.projectsService = params.projectsService;
    this.versions = params.versions;
    this.listWorkflowRuns = params.listWorkflowRuns;
    this.describeWorkflowRun = params.describeWorkflowRun;
    this.tenancy = params.tenancy;
    this.terminateWorkflowRun = params.terminateWorkflowRun;
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
    const versionNumberByProjectAndBuild = await this.buildVersionLookup(projects.map((project) => project.id));

    // One query per Temporal namespace: a single one in `shared` mode, one per project in `per-project`
    // mode (ADR 0057 (private)) — run in parallel (bounded), merged newest first.
    const groups = new Map<string, { projectId: string; taskQueues: string[] }>();
    for (const project of projects) {
      const namespace = this.tenancy.namespaceFor(project.id);
      const group = groups.get(namespace) ?? { projectId: project.id, taskQueues: [] };
      group.taskQueues.push(`workflow-dev-${project.id}`, `workflow-${project.id}`);
      groups.set(namespace, group);
    }
    const perNamespace = await mapWithConcurrency([...groups.values()], RUNS_QUERY_CONCURRENCY, (group) =>
      this.listWorkflowRuns(group),
    );
    const raw = perNamespace
      .flat()
      .toSorted((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
      .slice(0, RUNS_LIST_LIMIT);

    return raw
      .map((run) => this.enrich(run, projectNameById, versionNumberByProjectAndBuild))
      .filter(
        (run) =>
          (!filters.workflowName || run.workflowName === filters.workflowName) &&
          (!filters.version || run.version === filters.version) &&
          (!filters.buildId || run.buildId === filters.buildId),
      );
  }

  /**
   * The request carries no project, and in `per-project` mode an execution can only be found inside its
   * own project's namespace — so every owned project's namespace is probed (in parallel, bounded; one
   * probe in `shared` mode) until one has it. Ownership is still checked against the found execution's
   * own task queue below. `projectId`, when given, narrows the probe to that project.
   */
  async getRunDetail(
    ownerId: string,
    workflowId: string,
    runId: string,
    projectId?: string,
  ): Promise<IWorkflowRunDetail> {
    const ownedProjects = await this.projectsService.list(ownerId);
    const candidates = projectId ? ownedProjects.filter((project) => project.id === projectId) : ownedProjects;
    const byNamespace = new Map<string, string>();
    for (const project of candidates) {
      if (!byNamespace.has(this.tenancy.namespaceFor(project.id)))
        byNamespace.set(this.tenancy.namespaceFor(project.id), project.id);
    }
    const probes = await mapWithConcurrency([...byNamespace.values()], RUNS_QUERY_CONCURRENCY, (candidate) =>
      this.describeWorkflowRun({ projectId: candidate, workflowId, runId }),
    );
    const found = probes.find((result) => result !== null);
    if (!found) throw new NotFoundException(`Workflow run "${workflowId}" not found`);
    const detail = found;

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
    const detail = await this.describeWorkflowRun({ projectId, workflowId, runId });
    if (!detail) throw new NotFoundException(`Workflow run "${workflowId}" not found`);
    const parsed = parseTaskQueue(detail.taskQueue);
    if (parsed?.projectId !== projectId) {
      throw new NotFoundException(`Workflow run "${workflowId}" does not belong to this project`);
    }
    if (detail.status !== 'RUNNING') {
      throw new ConflictException(`Workflow run "${workflowId}" is not running (status ${detail.status})`);
    }
    await this.terminateWorkflowRun({ projectId, workflowId, runId, reason: 'terminated by the project owner' });
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
