// oxlint-disable max-lines, unicorn/consistent-function-scoping, unicorn/no-array-sort -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../projects/projects/project.entity.js';
import type { ProjectVersion } from '../build/build/project-version.entity.js';
import {
  RUNS_LIST_LIMIT,
  RUNS_QUERY_CONCURRENCY,
  RunsService,
  type IRawWorkflowRun,
  type IRawWorkflowRunDetail,
  type IRunsServiceParams,
} from './runs.service.js';

// Only `id`/`name`/`ownerId` are ever read by `RunsService` — the `owner` relation is irrelevant here.
const project = (id: string, name: string): Project =>
  ({ id, name, ownerId: 'owner-1', createdAt: new Date() }) as Project;

const makeService = (
  overrides: Partial<IRunsServiceParams> = {},
  versionRows: readonly Pick<ProjectVersion, 'projectId' | 'buildId' | 'versionNumber'>[] = [],
): RunsService =>
  new RunsService({
    projectsService: {
      list: vi.fn(() => Promise.resolve<Project[]>([])),
      getOwnedProject: vi.fn(() => Promise.reject(new NotFoundException())),
    },
    versions: { find: vi.fn(() => Promise.resolve(versionRows as ProjectVersion[])) },
    listWorkflowRuns: vi.fn(() => Promise.resolve([])),
    describeWorkflowRun: vi.fn(() => Promise.reject(new Error('not stubbed'))),
    tenancy: { namespaceFor: (projectId: string) => `falang-${projectId}` },
    ...overrides,
  });

describe('RunsService.listRuns', () => {
  it('returns an empty list without calling Temporal when the user owns no projects', async () => {
    const listWorkflowRuns = vi.fn(() => Promise.resolve<IRawWorkflowRun[]>([]));
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve([])), getOwnedProject: vi.fn() },
      listWorkflowRuns,
    });

    const runs = await service.listRuns('owner-1');

    expect(runs).toEqual([]);
    expect(listWorkflowRuns).not.toHaveBeenCalled();
  });

  it('queries both the dev and prod task queues for every owned project', async () => {
    const listWorkflowRuns = vi.fn(() => Promise.resolve<IRawWorkflowRun[]>([]));
    const service = makeService({
      projectsService: {
        list: vi.fn(() => Promise.resolve([project('p1', 'Project One'), project('p2', 'Project Two')])),
        getOwnedProject: vi.fn(),
      },
      listWorkflowRuns,
    });

    await service.listRuns('owner-1');

    // One query per namespace (per project here), each scoped to its own project's task queues.
    expect(listWorkflowRuns).toHaveBeenCalledTimes(2);
    expect(listWorkflowRuns).toHaveBeenCalledWith({ projectId: 'p1', taskQueues: ['workflow-dev-p1', 'workflow-p1'] });
    expect(listWorkflowRuns).toHaveBeenCalledWith({ projectId: 'p2', taskQueues: ['workflow-dev-p2', 'workflow-p2'] });
  });

  it("narrows to only the filtered project's task queues when projectId is given", async () => {
    const listWorkflowRuns = vi.fn(() => Promise.resolve<IRawWorkflowRun[]>([]));
    const service = makeService({
      projectsService: {
        list: vi.fn(() => Promise.resolve([project('p1', 'Project One'), project('p2', 'Project Two')])),
        getOwnedProject: vi.fn(),
      },
      listWorkflowRuns,
    });

    await service.listRuns('owner-1', { projectId: 'p2' });

    expect(listWorkflowRuns).toHaveBeenCalledTimes(1);
    expect(listWorkflowRuns).toHaveBeenCalledWith({ projectId: 'p2', taskQueues: ['workflow-dev-p2', 'workflow-p2'] });
  });

  it('returns an empty list without calling Temporal when projectId does not match any owned project', async () => {
    const listWorkflowRuns = vi.fn(() => Promise.resolve<IRawWorkflowRun[]>([]));
    const service = makeService({
      projectsService: {
        list: vi.fn(() => Promise.resolve([project('p1', 'Project One')])),
        getOwnedProject: vi.fn(),
      },
      listWorkflowRuns,
    });

    const runs = await service.listRuns('owner-1', { projectId: 'someone-elses-project' });

    expect(runs).toEqual([]);
    expect(listWorkflowRuns).not.toHaveBeenCalled();
  });

  it('filters by workflowName/version/buildId after enrichment', async () => {
    const raw: IRawWorkflowRun[] = [
      {
        workflowId: 'wf-1',
        runId: 'run-1',
        status: 'COMPLETED',
        workflowName: 'processOrder',
        taskQueue: 'workflow-dev-p1',
        buildId: null,
        startTime: '2026-07-21T00:00:00.000Z',
        closeTime: null,
      },
      {
        workflowId: 'wf-2',
        runId: 'run-2',
        status: 'RUNNING',
        workflowName: 'greet',
        taskQueue: 'workflow-p1',
        buildId: 'v1',
        startTime: '2026-07-21T00:00:00.000Z',
        closeTime: null,
      },
    ];
    const service = makeService(
      {
        projectsService: {
          list: vi.fn(() => Promise.resolve([project('p1', 'Project One')])),
          getOwnedProject: vi.fn(),
        },
        listWorkflowRuns: vi.fn(() => Promise.resolve(raw)),
      },
      [{ projectId: 'p1', buildId: 'v1', versionNumber: 1 }],
    );

    expect(await service.listRuns('owner-1', { workflowName: 'greet' })).toEqual([
      expect.objectContaining({ workflowId: 'wf-2' }),
    ]);
    expect(await service.listRuns('owner-1', { version: 'dev' })).toEqual([
      expect.objectContaining({ workflowId: 'wf-1' }),
    ]);
    expect(await service.listRuns('owner-1', { buildId: 'v1' })).toEqual([
      expect.objectContaining({ workflowId: 'wf-2' }),
    ]);
  });

  it('enriches a dev run with the project name and version "dev"', async () => {
    const raw: IRawWorkflowRun = {
      workflowId: 'wf-1',
      runId: 'run-1',
      status: 'COMPLETED',
      workflowName: 'processOrder',
      taskQueue: 'workflow-dev-p1',
      buildId: null,
      startTime: '2026-07-21T00:00:00.000Z',
      closeTime: null,
    };
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve([project('p1', 'Project One')])), getOwnedProject: vi.fn() },
      listWorkflowRuns: vi.fn(() => Promise.resolve([raw])),
    });

    const runs = await service.listRuns('owner-1');

    expect(runs).toEqual([{ ...raw, projectId: 'p1', projectName: 'Project One', env: 'dev', version: 'dev' }]);
  });

  it("resolves a prod run's build ID to its version number via the ProjectVersion table", async () => {
    const raw: IRawWorkflowRun = {
      workflowId: 'wf-1',
      runId: 'run-1',
      status: 'RUNNING',
      workflowName: 'processOrder',
      taskQueue: 'workflow-p1',
      buildId: 'v3',
      startTime: '2026-07-21T00:00:00.000Z',
      closeTime: null,
    };
    const service = makeService(
      {
        projectsService: {
          list: vi.fn(() => Promise.resolve([project('p1', 'Project One')])),
          getOwnedProject: vi.fn(),
        },
        listWorkflowRuns: vi.fn(() => Promise.resolve([raw])),
      },
      [{ projectId: 'p1', buildId: 'v3', versionNumber: 3 }],
    );

    const runs = await service.listRuns('owner-1');

    expect(runs[0]).toEqual(expect.objectContaining({ env: 'prod', version: '3' }));
  });

  it('falls back to the raw build ID when no matching ProjectVersion row exists', async () => {
    const raw: IRawWorkflowRun = {
      workflowId: 'wf-1',
      runId: 'run-1',
      status: 'RUNNING',
      workflowName: 'processOrder',
      taskQueue: 'workflow-p1',
      buildId: 'v9',
      startTime: '2026-07-21T00:00:00.000Z',
      closeTime: null,
    };
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve([project('p1', 'Project One')])), getOwnedProject: vi.fn() },
      listWorkflowRuns: vi.fn(() => Promise.resolve([raw])),
    });

    const runs = await service.listRuns('owner-1');

    expect(runs[0]).toEqual(expect.objectContaining({ env: 'prod', version: 'v9' }));
  });

  it('reports "unknown" for a prod run with no build ID at all', async () => {
    const raw: IRawWorkflowRun = {
      workflowId: 'wf-1',
      runId: 'run-1',
      status: 'RUNNING',
      workflowName: 'processOrder',
      taskQueue: 'workflow-p1',
      buildId: null,
      startTime: '2026-07-21T00:00:00.000Z',
      closeTime: null,
    };
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve([project('p1', 'Project One')])), getOwnedProject: vi.fn() },
      listWorkflowRuns: vi.fn(() => Promise.resolve([raw])),
    });

    const runs = await service.listRuns('owner-1');

    expect(runs[0]).toEqual(expect.objectContaining({ version: 'unknown' }));
  });
});

describe('RunsService.getRunDetail', () => {
  const detailBase: IRawWorkflowRunDetail = {
    workflowId: 'wf-1',
    runId: 'run-1',
    status: 'COMPLETED',
    workflowName: 'processOrder',
    taskQueue: 'workflow-dev-p1',
    buildId: null,
    startTime: '2026-07-21T00:00:00.000Z',
    closeTime: '2026-07-21T00:01:00.000Z',
    input: [1],
    result: 42,
    events: [{ id: '1', time: '2026-07-21T00:00:00.000Z', type: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED' }],
  };

  it("throws NotFound when the run's task queue does not belong to any project", async () => {
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve([project('p1', 'Project One')])), getOwnedProject: vi.fn() },
      describeWorkflowRun: vi.fn(() => Promise.resolve({ ...detailBase, taskQueue: 'some-other-queue' })),
    });

    await expect(service.getRunDetail('owner-1', 'wf-1', 'run-1')).rejects.toThrow(NotFoundException);
  });

  it('rejects when the parsed project is not owned by the requesting user', async () => {
    const getOwnedProject = vi.fn(() => Promise.reject(new NotFoundException()));
    const service = makeService({
      describeWorkflowRun: vi.fn(() => Promise.resolve(detailBase)),
      projectsService: { list: vi.fn(() => Promise.resolve([project('p9', 'Other')])), getOwnedProject },
    });

    await expect(service.getRunDetail('owner-1', 'wf-1', 'run-1')).rejects.toThrow(NotFoundException);
    expect(getOwnedProject).toHaveBeenCalledWith('p1', 'owner-1');
  });

  it('returns the enriched detail for an owned dev run', async () => {
    const service = makeService({
      describeWorkflowRun: vi.fn(() => Promise.resolve(detailBase)),
      projectsService: {
        list: vi.fn(() => Promise.resolve([project('p1', 'Project One')])),
        getOwnedProject: vi.fn(() => Promise.resolve(project('p1', 'Project One'))),
      },
    });

    const detail = await service.getRunDetail('owner-1', 'wf-1', 'run-1');

    expect(detail).toEqual({ ...detailBase, projectId: 'p1', projectName: 'Project One', env: 'dev', version: 'dev' });
  });

  it('resolves the version number for an owned prod run', async () => {
    const service = makeService(
      {
        describeWorkflowRun: vi.fn(() => Promise.resolve({ ...detailBase, taskQueue: 'workflow-p1', buildId: 'v2' })),
        projectsService: {
          list: vi.fn(() => Promise.resolve([project('p1', 'Project One')])),
          getOwnedProject: vi.fn(() => Promise.resolve(project('p1', 'Project One'))),
        },
      },
      [{ projectId: 'p1', buildId: 'v2', versionNumber: 2 }],
    );

    const detail = await service.getRunDetail('owner-1', 'wf-1', 'run-1');

    expect(detail).toEqual(expect.objectContaining({ env: 'prod', version: '2' }));
  });
});

describe('RunsService across Temporal namespaces', () => {
  const run = (projectId: string, workflowId: string, startTime: string): IRawWorkflowRun => ({
    workflowId,
    runId: `run-${workflowId}`,
    status: 'COMPLETED',
    workflowName: 'greet',
    taskQueue: `workflow-${projectId}`,
    buildId: 'v1',
    startTime,
    closeTime: null,
  });
  const ownedProjects = (count: number): Project[] =>
    Array.from({ length: count }, (_, index) => project(`p${index + 1}`, `Project ${index + 1}`));

  it('merges the per-namespace results, newest first', async () => {
    const byProject: Record<string, IRawWorkflowRun[]> = {
      p1: [run('p1', 'a', '2026-07-21T10:00:00.000Z'), run('p1', 'b', '2026-07-21T08:00:00.000Z')],
      p2: [run('p2', 'c', '2026-07-21T09:00:00.000Z')],
      p3: [run('p3', 'd', '2026-07-21T11:00:00.000Z')],
    };
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve(ownedProjects(3))), getOwnedProject: vi.fn() },
      listWorkflowRuns: vi.fn(({ projectId }) => Promise.resolve(byProject[projectId] ?? [])),
    });

    const runs = await service.listRuns('owner-1');

    expect(runs.map((entry) => entry.workflowId)).toEqual(['d', 'a', 'c', 'b']);
  });

  it('queries at most RUNS_QUERY_CONCURRENCY namespaces at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const listWorkflowRuns = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      inFlight -= 1;
      return [];
    });
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve(ownedProjects(25))), getOwnedProject: vi.fn() },
      listWorkflowRuns,
    });

    await service.listRuns('owner-1');

    expect(listWorkflowRuns).toHaveBeenCalledTimes(25);
    expect(maxInFlight).toBeLessThanOrEqual(RUNS_QUERY_CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('caps the merged list at RUNS_LIST_LIMIT, keeping the newest', async () => {
    const many = (projectId: string, count: number): IRawWorkflowRun[] =>
      Array.from({ length: count }, (_, index) =>
        run(projectId, `${projectId}-${index}`, new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()),
      );
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve(ownedProjects(2))), getOwnedProject: vi.fn() },
      listWorkflowRuns: vi.fn(({ projectId }) => Promise.resolve(many(projectId, RUNS_LIST_LIMIT))),
    });

    const runs = await service.listRuns('owner-1');

    expect(runs).toHaveLength(RUNS_LIST_LIMIT);
  });

  it('sends one query for all projects when they share a namespace (shared mode)', async () => {
    const listWorkflowRuns = vi.fn(() => Promise.resolve<IRawWorkflowRun[]>([]));
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve(ownedProjects(3))), getOwnedProject: vi.fn() },
      listWorkflowRuns,
      tenancy: { namespaceFor: () => 'default' },
    });

    await service.listRuns('owner-1');

    expect(listWorkflowRuns).toHaveBeenCalledTimes(1);
    expect(listWorkflowRuns).toHaveBeenCalledWith({
      projectId: 'p1',
      taskQueues: [
        'workflow-dev-p1',
        'workflow-p1',
        'workflow-dev-p2',
        'workflow-p2',
        'workflow-dev-p3',
        'workflow-p3',
      ],
    });
  });

  it('finds a run by probing the owned projects namespaces, and only those', async () => {
    const detail: IRawWorkflowRunDetail = {
      ...run('p2', 'wf-1', '2026-07-21T00:00:00.000Z'),
      input: null,
      result: null,
      events: [],
    };
    const describeWorkflowRun = vi.fn(({ projectId }: { projectId: string }) =>
      Promise.resolve(projectId === 'p2' ? detail : null),
    );
    const service = makeService({
      projectsService: {
        list: vi.fn(() => Promise.resolve(ownedProjects(3))),
        getOwnedProject: vi.fn(() => Promise.resolve(project('p2', 'Project 2'))),
      },
      describeWorkflowRun,
    });

    const result = await service.getRunDetail('owner-1', 'wf-1', 'run-wf-1');

    expect(result.projectId).toBe('p2');
    expect(describeWorkflowRun.mock.calls.map(([params]) => params.projectId).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('narrows the probe to the given projectId, and 404s for a project the user does not own', async () => {
    const describeWorkflowRun = vi.fn(() => Promise.resolve(null));
    const service = makeService({
      projectsService: { list: vi.fn(() => Promise.resolve(ownedProjects(3))), getOwnedProject: vi.fn() },
      describeWorkflowRun,
    });

    await expect(service.getRunDetail('owner-1', 'wf-1', 'run-1', 'p2')).rejects.toThrow(NotFoundException);
    expect(describeWorkflowRun).toHaveBeenCalledTimes(1);
    expect(describeWorkflowRun).toHaveBeenCalledWith({ projectId: 'p2', workflowId: 'wf-1', runId: 'run-1' });

    describeWorkflowRun.mockClear();
    await expect(service.getRunDetail('owner-1', 'wf-1', 'run-1', 'not-mine')).rejects.toThrow(NotFoundException);
    expect(describeWorkflowRun).not.toHaveBeenCalled();
  });
});
