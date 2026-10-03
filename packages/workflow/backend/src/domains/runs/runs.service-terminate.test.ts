import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../projects/projects/project.entity.js';
import { RunsService, type IRawWorkflowRunDetail, type IRunsServiceParams } from './runs.service.js';

const project = (id: string, name: string): Project =>
  ({ id, name, ownerId: 'owner-1', createdAt: new Date() }) as Project;

const makeService = (overrides: Partial<IRunsServiceParams> = {}): RunsService =>
  new RunsService({
    projectsService: {
      list: vi.fn(() => Promise.resolve<Project[]>([])),
      getOwnedProject: vi.fn(() => Promise.reject(new NotFoundException())),
    },
    versions: { find: vi.fn(() => Promise.resolve([])) },
    listWorkflowRuns: vi.fn(() => Promise.resolve([])),
    describeWorkflowRun: vi.fn(() => Promise.reject(new Error('not stubbed'))),
    tenancy: { namespaceFor: (projectId: string) => `ns-${projectId}` },
    ...overrides,
  });

describe('RunsService.terminateRun', () => {
  const running: IRawWorkflowRunDetail = {
    workflowId: 'wf-1',
    runId: 'run-1',
    status: 'RUNNING',
    workflowName: 'processOrder',
    taskQueue: 'workflow-dev-p1',
    buildId: null,
    startTime: '2026-07-21T00:00:00.000Z',
    closeTime: null,
    input: [],
    result: null,
    events: [],
  };
  const owned = {
    list: vi.fn(),
    getOwnedProject: vi.fn(() => Promise.resolve(project('p1', 'Project One'))),
  };

  it('terminates an open run of the owned project', async () => {
    const terminateWorkflowRun = vi.fn(() => Promise.resolve());
    const service = makeService({
      projectsService: owned,
      describeWorkflowRun: vi.fn(() => Promise.resolve(running)),
      terminateWorkflowRun,
    });

    await service.terminateRun('owner-1', 'p1', 'wf-1', 'run-1');

    expect(terminateWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'wf-1', runId: 'run-1' }));
  });

  it('rejects a project the caller does not own without touching Temporal', async () => {
    const terminateWorkflowRun = vi.fn(() => Promise.resolve());
    const describeWorkflowRun = vi.fn(() => Promise.resolve(running));
    const service = makeService({ describeWorkflowRun, terminateWorkflowRun });

    await expect(service.terminateRun('owner-1', 'p1', 'wf-1', 'run-1')).rejects.toThrow(NotFoundException);
    expect(describeWorkflowRun).not.toHaveBeenCalled();
    expect(terminateWorkflowRun).not.toHaveBeenCalled();
  });

  it('rejects a run that belongs to another project', async () => {
    const terminateWorkflowRun = vi.fn(() => Promise.resolve());
    const service = makeService({
      projectsService: owned,
      describeWorkflowRun: vi.fn(() => Promise.resolve({ ...running, taskQueue: 'workflow-dev-other' })),
      terminateWorkflowRun,
    });

    await expect(service.terminateRun('owner-1', 'p1', 'wf-1', 'run-1')).rejects.toThrow(NotFoundException);
    expect(terminateWorkflowRun).not.toHaveBeenCalled();
  });

  it('rejects a run that is already closed with a 409', async () => {
    const terminateWorkflowRun = vi.fn(() => Promise.resolve());
    const service = makeService({
      projectsService: owned,
      describeWorkflowRun: vi.fn(() => Promise.resolve({ ...running, status: 'COMPLETED' })),
      terminateWorkflowRun,
    });

    await expect(service.terminateRun('owner-1', 'p1', 'wf-1', 'run-1')).rejects.toThrow(ConflictException);
    expect(terminateWorkflowRun).not.toHaveBeenCalled();
  });
});
