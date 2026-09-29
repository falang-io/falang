import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { WorkflowNotFoundError } from '@temporalio/client';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from '../projects/projects/project.entity.js';
import type { Task } from './task.entity.js';
import { TasksService, type ITasksServiceParams } from './tasks.service.js';
import type { ICreateTaskInput, ITaskOption } from './task.types.js';

/**
 * A minimal in-memory stand-in for `Repository<Task>` — real enough to exercise
 * `TasksService`'s own conditional-update logic (the optimistic `status: 'open'` guard in
 * `resolve`, the unique-key upsert in `createOrGet`) without a real database, mirroring
 * `RunsService.test.ts`'s own plain-closure-dependency style.
 */
class FakeTaskRepo {
  readonly rows: Task[] = [];

  findOneBy = vi.fn((where: Partial<Task>): Promise<Task | null> => {
    const match = this.rows.find((row) => Object.entries(where).every(([key, value]) => (row as never)[key] === value));
    return Promise.resolve(match ? { ...match } : null);
  });

  create = vi.fn((partial: Partial<Task>): Task => ({ id: randomUUID(), ...partial }) as Task);

  // Mimics `@CreateDateColumn` — the real column is populated by the database at `INSERT` time,
  // not by `Repository.create()`.
  save = vi.fn((task: Task): Promise<Task> => {
    const dupe = this.rows.find(
      (row) =>
        row.id !== task.id && row.workflowId === task.workflowId && row.runId === task.runId && row.nodeId === task.nodeId,
    );
    if (dupe) return Promise.reject(new Error('duplicate key value violates unique constraint'));
    const stored = { ...task, createdAt: task.createdAt ?? new Date() };
    this.rows.push(stored);
    return Promise.resolve(stored);
  });

  update = vi.fn((criteria: Partial<Task>, partial: Partial<Task>): Promise<{ affected: number }> => {
    const matches = this.rows.filter((row) => Object.entries(criteria).every(([key, value]) => (row as never)[key] === value));
    for (const row of matches) Object.assign(row, partial);
    return Promise.resolve({ affected: matches.length });
  });

  find = vi.fn((): Promise<Task[]> => Promise.resolve([...this.rows]));
}

const project = (id: string, ownerId: string, name = 'Project One'): Project => ({ id, name, ownerId, createdAt: new Date(), lastEditedAt: null }) as Project;

const options: ITaskOption[] = [
  { label: 'Approve', dataType: 'void' },
  { label: 'Reject', dataType: 'string', prompt: 'Reason' },
];

const createInput = (overrides: Partial<ICreateTaskInput> = {}): ICreateTaskInput => ({
  workflowId: 'wf-1',
  runId: 'run-1',
  taskQueue: 'workflow-dev-p1',
  env: 'dev',
  nodeId: 'node-1',
  title: 'Approve invoice',
  description: 'Please approve.',
  options,
  ...overrides,
});

interface IMakeServiceResult {
  readonly service: TasksService;
  readonly repo: FakeTaskRepo;
  readonly ensureRunnerRunning: ReturnType<typeof vi.fn>;
  readonly signalWorkflow: ReturnType<typeof vi.fn>;
}

const makeService = (
  overrides: Partial<Omit<ITasksServiceParams, 'tasks'>> = {},
  ownedProject: Project = project('p1', 'owner-1'),
): IMakeServiceResult => {
  const repo = new FakeTaskRepo();
  const ensureRunnerRunning = vi.fn(() => Promise.resolve());
  const signalWorkflow = vi.fn(() => Promise.resolve());
  const service = new TasksService({
    tasks: repo as unknown as Repository<Task>,
    projectsService: {
      list: vi.fn(() => Promise.resolve([ownedProject])),
      getOwnedProject: vi.fn((id: string, ownerId: string) => {
        if (id === ownedProject.id && ownerId === ownedProject.ownerId) return Promise.resolve(ownedProject);
        return Promise.reject(new NotFoundException(`Project "${id}" not found`));
      }),
    },
    ensureRunnerRunning,
    signalWorkflow,
    ...overrides,
  });
  return { service, repo, ensureRunnerRunning, signalWorkflow };
};

describe('TasksService.createOrGet', () => {
  it('creates a new open task and returns its id', async () => {
    const { service, repo } = makeService();
    const result = await service.createOrGet('p1', createInput());
    expect(result.taskId).toBeTypeOf('string');
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]?.status).toBe('open');
  });

  it('is idempotent for the same (workflowId, runId, nodeId) — a retried ask returns the same id', async () => {
    const { service } = makeService();
    const first = await service.createOrGet('p1', createInput());
    const second = await service.createOrGet('p1', createInput());
    expect(second.taskId).toBe(first.taskId);
  });

  it('re-reads the winning row when a concurrent insert races the unique constraint', async () => {
    const { service, repo } = makeService();
    // Simulate a race: `findOneBy` finds nothing (both attempts miss the initial read), but by the
    // time this attempt's `save()` runs, the other attempt's row is already there.
    repo.findOneBy.mockImplementationOnce(() => Promise.resolve(null));
    const winner = repo.create({ id: randomUUID(), ...createInput(), projectId: 'p1', status: 'open' } as Partial<Task>);
    repo.rows.push(winner as Task);

    const result = await service.createOrGet('p1', createInput());
    expect(result.taskId).toBe(winner.id);
    expect(repo.rows).toHaveLength(1);
  });

  it('sets dueAt from timeoutSeconds', async () => {
    const { service, repo } = makeService();
    const before = Date.now();
    await service.createOrGet('p1', createInput({ timeoutSeconds: 60 }));
    const dueAt = repo.rows[0]?.dueAt as Date;
    expect(dueAt.getTime()).toBeGreaterThanOrEqual(before + 59_000);
  });
});

describe('TasksService.close', () => {
  it('transitions an open task to the given terminal status', async () => {
    const { service, repo } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());

    await service.close('p1', taskId, 'expired');

    expect(repo.rows[0]?.status).toBe('expired');
  });

  it('no-ops when the task is not open', async () => {
    const { service, repo } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());
    await service.close('p1', taskId, 'cancelled');

    await service.close('p1', taskId, 'expired');

    expect(repo.rows[0]?.status).toBe('cancelled');
  });
});

describe('TasksService.resolve', () => {
  it('resolves a void option: marks done, wakes the runner before signaling, and sends the expected payload', async () => {
    const { service, ensureRunnerRunning, signalWorkflow } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());
    const callOrder: string[] = [];
    ensureRunnerRunning.mockImplementation(() => {
      callOrder.push('ensureRunnerRunning');
      return Promise.resolve();
    });
    signalWorkflow.mockImplementation(() => {
      callOrder.push('signalWorkflow');
      return Promise.resolve();
    });

    const result = await service.resolve('owner-1', taskId, { answer: 'Approve' }, 'user-1');

    expect(result.status).toBe('done');
    expect(result.answer).toBe('Approve');
    expect(result.answerData).toBeNull();
    expect(callOrder).toEqual(['ensureRunnerRunning', 'signalWorkflow']);
    expect(ensureRunnerRunning).toHaveBeenCalledWith('p1', 'dev', 'workflow-dev-p1');
    expect(signalWorkflow).toHaveBeenCalledWith(
      'wf-1',
      'run-1',
      'humanTaskAnswer',
      expect.objectContaining({ messageId: taskId, value: 'Approve', resolvedBy: 'user-1' }),
    );
    const payload = signalWorkflow.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('data');
  });

  it('resolves a typed option and includes `data` in the signal payload', async () => {
    const { service, signalWorkflow } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());

    const result = await service.resolve('owner-1', taskId, { answer: 'Reject', data: 'too expensive' }, 'user-1');

    expect(result.answerData).toBe('too expensive');
    expect(signalWorkflow).toHaveBeenCalledWith(
      'wf-1',
      'run-1',
      'humanTaskAnswer',
      expect.objectContaining({ data: 'too expensive' }),
    );
  });

  it('rejects an answer that is not one of the task options', async () => {
    const { service } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());

    await expect(service.resolve('owner-1', taskId, { answer: 'Nope' }, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects data that doesn't match the option's dataType", async () => {
    const { service } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());

    await expect(service.resolve('owner-1', taskId, { answer: 'Reject', data: 42 }, 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('409s when the task is no longer open (optimistic update loses the race)', async () => {
    const { service } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());
    await service.resolve('owner-1', taskId, { answer: 'Approve' }, 'user-1');

    await expect(service.resolve('owner-1', taskId, { answer: 'Approve' }, 'user-2')).rejects.toBeInstanceOf(ConflictException);
  });

  it('flips to orphaned with the error message when the signal hits WorkflowNotFoundError', async () => {
    const { service, signalWorkflow } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());
    signalWorkflow.mockImplementation(() => Promise.reject(new WorkflowNotFoundError('workflow not found', 'wf-1', 'run-1')));

    const result = await service.resolve('owner-1', taskId, { answer: 'Approve' }, 'user-1');

    expect(result.status).toBe('orphaned');
    expect(result.orphanReason).toBe('workflow not found');
  });

  it('reopens the task and rethrows on any other signal failure', async () => {
    const { service, repo, signalWorkflow } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());
    signalWorkflow.mockImplementation(() => Promise.reject(new Error('read ETIMEDOUT')));

    await expect(service.resolve('owner-1', taskId, { answer: 'Approve' }, 'user-1')).rejects.toThrow('read ETIMEDOUT');

    expect(repo.rows[0]?.status).toBe('open');
    expect(repo.rows[0]?.answer).toBeNull();
    expect(repo.rows[0]?.resolvedBy).toBeNull();
  });

  it("404s for a task belonging to a project the caller doesn't own", async () => {
    const { service } = makeService();
    const { taskId } = await service.createOrGet('p1', createInput());

    await expect(service.resolve('someone-else', taskId, { answer: 'Approve' }, 'someone-else')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
