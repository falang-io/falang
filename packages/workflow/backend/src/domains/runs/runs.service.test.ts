import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../projects/projects/project.entity.js';
import type { ProjectVersion } from '../build/build/project-version.entity.js';
import {
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

    expect(listWorkflowRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueues: ['workflow-dev-p1', 'workflow-p1', 'workflow-dev-p2', 'workflow-p2'],
      }),
    );
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

    expect(listWorkflowRuns).toHaveBeenCalledWith(
      expect.objectContaining({ taskQueues: ['workflow-dev-p2', 'workflow-p2'] }),
    );
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
      describeWorkflowRun: vi.fn(() => Promise.resolve({ ...detailBase, taskQueue: 'some-other-queue' })),
    });

    await expect(service.getRunDetail('owner-1', 'wf-1', 'run-1')).rejects.toThrow(NotFoundException);
  });

  it('rejects when the parsed project is not owned by the requesting user', async () => {
    const getOwnedProject = vi.fn(() => Promise.reject(new NotFoundException()));
    const service = makeService({
      describeWorkflowRun: vi.fn(() => Promise.resolve(detailBase)),
      projectsService: { list: vi.fn(), getOwnedProject },
    });

    await expect(service.getRunDetail('owner-1', 'wf-1', 'run-1')).rejects.toThrow(NotFoundException);
    expect(getOwnedProject).toHaveBeenCalledWith('p1', 'owner-1');
  });

  it('returns the enriched detail for an owned dev run', async () => {
    const service = makeService({
      describeWorkflowRun: vi.fn(() => Promise.resolve(detailBase)),
      projectsService: {
        list: vi.fn(),
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
          list: vi.fn(),
          getOwnedProject: vi.fn(() => Promise.resolve(project('p1', 'Project One'))),
        },
      },
      [{ projectId: 'p1', buildId: 'v2', versionNumber: 2 }],
    );

    const detail = await service.getRunDetail('owner-1', 'wf-1', 'run-1');

    expect(detail).toEqual(expect.objectContaining({ env: 'prod', version: '2' }));
  });
});
