// oxlint-disable max-lines -- the service owns every task transition.
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { isNamespaceNotFoundError, type IRunJournalProblemPort } from '@falang/workflow-gateway';
import { WorkflowNotFoundError } from '@temporalio/client';
import { In, type QueryDeepPartialEntity, type Repository } from 'typeorm';
import { TaskRunUnavailableError } from './task-run-unavailable.error.js';
import { devTaskQueue, prodTaskQueue } from '../build/build/task-queue-names.js';
import type { TProjectsPort } from '../projects/projects/projects-port.js';
import type { Task } from './task.entity.js';
import {
  HUMAN_TASK_ANSWER_SIGNAL_NAME,
  type IApiTask,
  type ICreateTaskInput,
  type ITaskOption,
  type ITasksFilters,
} from './task.types.js';

/** Sends one signal to a known, already-running execution — never `signalWithStart` (see `TasksService.resolve`'s doc comment for why). `projectId` picks the namespace the run lives in (ADR 0057 (private)). */
export type TSignalWorkflow = (
  projectId: string,
  workflowId: string,
  runId: string,
  signalName: string,
  payload: unknown,
) => Promise<void>;

/** Describes a run in the project's own Temporal namespace: its task queue, or `null` when no such run exists (security audit P1-11). */
export type TDescribeWorkflow = (
  projectId: string,
  workflowId: string,
  runId: string,
) => Promise<{ readonly taskQueue: string } | null>;

/** The task queue a project's runs of `env` live on — the server-side source of truth, never the request body. */
export const expectedTaskQueue = (projectId: string, env: 'dev' | 'prod'): string =>
  env === 'dev' ? devTaskQueue(projectId) : prodTaskQueue(projectId);

export interface ITasksServiceParams {
  readonly tasks: Pick<Repository<Task>, 'find' | 'findOneBy' | 'create' | 'save' | 'update'>;
  readonly projectsService: TProjectsPort;
  /**
   * Who a new task goes to (ADR 0070 (private), `ProjectMembersService.pickTaskAssignee`). Optional: without it a task is
   * assigned to nobody (`null`), which only unit tests rely on.
   */
  readonly pickAssignee?: (projectId: string) => Promise<string | null>;
  /** Display names for assignees, by user id. Optional — without it `assigneeName` is `null`. */
  readonly usernames?: (userIds: readonly string[]) => Promise<Map<string, string>>;
  /** `BuildService.ensureRunnerRunning`, bound — see `tasks.module.ts`. Narrowed to a plain closure, the same reasoning `RunsService`'s own DI-light constructor gives, so this stays trivially unit-testable. */
  readonly ensureRunnerRunning: (projectId: string, env: 'dev' | 'prod', taskQueue: string) => Promise<void>;
  readonly signalWorkflow: TSignalWorkflow;
  /** Checks that a run exists and sits on the project's task queue (P1-11); required so the check cannot be forgotten. */
  readonly describeWorkflow: TDescribeWorkflow;
  /** Run journal writer (ADR 0059 (private) §2c) — an orphaned resolution leaves an `error` entry on its run. Optional. */
  readonly journal?: IRunJournalProblemPort;
}

const validateAnswerData = (option: ITaskOption, data: unknown): void => {
  // `dataType` captured first, compared as a plain string — oxlint's `no-undefined` and
  // `unicorn/no-typeof-undefined` rules otherwise fire on the two different-but-equally-obvious
  // ways to spell "no value was passed" (same workaround `@falang/desktop-arduino-dto`'s
  // `parseDevicesDocumentData` already uses).
  const dataType = typeof data;
  switch (option.dataType) {
    case 'void': {
      if (dataType !== 'undefined') throw new BadRequestException(`Option "${option.label}" takes no value`);
      break;
    }
    case 'string': {
      if (typeof data !== 'string') throw new BadRequestException(`Option "${option.label}" expects a string value`);
      break;
    }
    case 'number': {
      if (typeof data !== 'number') throw new BadRequestException(`Option "${option.label}" expects a number value`);
      break;
    }
    case 'boolean': {
      if (typeof data !== 'boolean') throw new BadRequestException(`Option "${option.label}" expects a boolean value`);
      break;
    }
    default: {
      const exhaustive: never = option.dataType;
      throw new BadRequestException(`Unknown option data type "${String(exhaustive)}"`);
    }
  }
};

/**
 * Owns the `tasks` table — see ADR 0040 (private) §2/§3/§4 and the
 * fixed phase-4 contract. `resolve`'s ordering matters: mark `done` (optimistic, so two tabs of the
 * same owner can't both win — see the `UPDATE ... WHERE status = 'open'` below), *then*
 * `ensureRunnerRunning` (the pod may have scaled to zero while the task sat for days), *then* the
 * signal — a plain `client.workflow.getHandle(workflowId, runId).signal(...)`, never
 * `signalWithStart`: if the run is gone (terminated, failed, `continue-as-new`d away), the signal
 * throws `WorkflowNotFoundError` and the row is flipped to `orphaned` with the error kept for the
 * task page, instead of silently starting a fresh, unrelated execution. Any *other* signal failure
 * (a transient Temporal/network error) can't safely be left `done` — nothing ran on the workflow
 * side — so the row is reopened (`status: 'open'`, answer cleared) and the error rethrown, letting a
 * retry (another click, a support retry) resolve it again.
 */
export class TasksService {
  private readonly tasks: Pick<Repository<Task>, 'find' | 'findOneBy' | 'create' | 'save' | 'update'>;
  private readonly projectsService: TProjectsPort;
  private readonly pickAssignee: ((projectId: string) => Promise<string | null>) | undefined;
  private readonly usernames: ((userIds: readonly string[]) => Promise<Map<string, string>>) | undefined;
  private readonly ensureRunnerRunning: (projectId: string, env: 'dev' | 'prod', taskQueue: string) => Promise<void>;
  private readonly signalWorkflow: TSignalWorkflow;
  private readonly describeWorkflow: TDescribeWorkflow;
  private readonly journal: IRunJournalProblemPort | undefined;

  constructor(params: ITasksServiceParams) {
    this.tasks = params.tasks;
    this.projectsService = params.projectsService;
    this.pickAssignee = params.pickAssignee;
    this.usernames = params.usernames;
    this.ensureRunnerRunning = params.ensureRunnerRunning;
    this.signalWorkflow = params.signalWorkflow;
    this.describeWorkflow = params.describeWorkflow;
    this.journal = params.journal;
  }

  /**
   * Called by the compiled `ask` activity — upserts by `(workflowId, runId, nodeId)` so a retried
   * activity attempt returns the same row instead of duplicating it. The unique constraint is the
   * source of truth for the race (two concurrent retries both missing the initial `findOneBy`): the
   * loser's `save()` throws, and re-reading by the same key picks up the winner's row.
   */
  async createOrGet(projectId: string, input: ICreateTaskInput): Promise<{ taskId: string }> {
    const key = { projectId, workflowId: input.workflowId, runId: input.runId, nodeId: input.nodeId };
    const existing = await this.tasks.findOneBy(key);
    if (existing) return { taskId: existing.id };

    // The runner supplies workflowId/runId/env itself: make sure that run really exists on this project's queue.
    const taskQueue = expectedTaskQueue(projectId, input.env);
    const described = await this.describeWorkflow(projectId, input.workflowId, input.runId);
    if (!described) throw new NotFoundException('Workflow run not found for this project');
    if (described.taskQueue !== taskQueue) throw new ForbiddenException('Workflow run does not belong to this project');

    const dueAt = typeof input.timeoutSeconds === 'number' ? new Date(Date.now() + input.timeoutSeconds * 1000) : null;
    const assigneeId = this.pickAssignee ? await this.pickAssignee(projectId) : null;
    const task = this.tasks.create({
      ...key,
      assigneeId,
      env: input.env,
      taskQueue,
      title: input.title,
      description: input.description,
      payload: input.payload ?? null,
      attachments: input.attachments ? [...input.attachments] : null,
      options: [...input.options],
      status: 'open',
      answer: null,
      answerData: null,
      resolvedBy: null,
      dueAt,
      resolvedAt: null,
      orphanReason: null,
    });

    try {
      const saved = await this.tasks.save(task);
      return { taskId: saved.id };
    } catch (error) {
      // Concurrent retry of the same ask activity raced us on the unique `(workflowId, runId,
      // nodeId)` constraint — the winner's row is what we return, not a duplicate.
      const raced = await this.tasks.findOneBy(key);
      if (raced) return { taskId: raced.id };
      throw error;
    }
  }

  /** Only transitions a still-`open` task — a task already `done`/`expired`/`cancelled`/`orphaned` is a no-op, matching the internal API's own `200 {}` "no-op" contract. */
  async close(projectId: string, taskId: string, status: 'expired' | 'cancelled'): Promise<void> {
    await this.tasks.update({ id: taskId, projectId, status: 'open' }, { status, resolvedAt: new Date() });
  }

  /**
   * Every task of every project `userId` owns or is an editor/executor of (ADR 0070 (private)) — `projectId` only
   * narrows within that set, exactly like `RunsService.listRuns`; `assignee: 'me'` keeps the caller's own queue.
   */
  async list(userId: string, filters: ITasksFilters = {}): Promise<IApiTask[]> {
    const accessible = await this.projectsService.listAccessible(userId, 'tasks');
    const projects = filters.projectId ? accessible.filter((project) => project.id === filters.projectId) : accessible;
    if (projects.length === 0) return [];

    const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
    const rows = await this.tasks.find({
      where: {
        projectId: In(projects.map((project) => project.id)),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.assignee === 'me' ? { assigneeId: userId } : {}),
      },
      order: { createdAt: 'DESC' },
    });
    const names = await this.assigneeNames(rows);
    return rows.map((row) => this.toApiTask(row, projectNameById.get(row.projectId) ?? row.projectId, names));
  }

  /** 404s both for an unknown task id and for a task of a project `userId` has no task access to — never leaks which. */
  async get(userId: string, id: string): Promise<IApiTask> {
    const row = await this.tasks.findOneBy({ id });
    if (!row) throw new NotFoundException(`Task "${id}" not found`);
    const project = await this.projectsService.getOwnedProject(row.projectId, userId, 'tasks');
    return this.toApiTask(row, project.name, await this.assigneeNames([row]));
  }

  private assigneeNames(rows: readonly Task[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.assigneeId).filter((id): id is string => id !== null))];
    return this.usernames && ids.length > 0 ? this.usernames(ids) : Promise.resolve(new Map());
  }

  async resolve(
    ownerId: string,
    id: string,
    input: { readonly answer: string; readonly data?: string | number | boolean },
    resolvedBy: string,
  ): Promise<IApiTask> {
    const row = await this.tasks.findOneBy({ id });
    if (!row) throw new NotFoundException(`Task "${id}" not found`);
    const project = await this.projectsService.getOwnedProject(row.projectId, ownerId, 'tasks');

    const option = row.options.find((candidate) => candidate.label === input.answer);
    if (!option) throw new BadRequestException(`"${input.answer}" is not one of this task's options`);
    validateAnswerData(option, input.data);

    const resolvedAt = new Date();
    // `answerData`/`payload` are `unknown`-typed columns — TypeORM's `QueryDeepPartialEntity` mapped
    // type has no representation for a bare `unknown` property beyond `{}`, which rejects an
    // explicit `null` even though the column itself is nullable; cast past it rather than loosen
    // the entity's own (accurate) TS type.
    const resolvedFields = {
      status: 'done',
      answer: input.answer,
      answerData: option.dataType === 'void' ? null : (input.data ?? null),
      resolvedBy,
      resolvedAt,
    } as unknown as QueryDeepPartialEntity<Task>;
    const updateResult = await this.tasks.update({ id: row.id, status: 'open' }, resolvedFields);
    if (updateResult.affected === 0) throw new ConflictException(`Task "${id}" is not open`);

    try {
      const taskQueue = expectedTaskQueue(row.projectId, row.env);
      const described = await this.describeWorkflow(row.projectId, row.workflowId, row.runId);
      if (!described) throw new TaskRunUnavailableError('the run no longer exists');
      if (described.taskQueue !== taskQueue) {
        throw new TaskRunUnavailableError('the run does not belong to this project');
      }
      await this.ensureRunnerRunning(row.projectId, row.env, taskQueue);
      await this.signalWorkflow(row.projectId, row.workflowId, row.runId, HUMAN_TASK_ANSWER_SIGNAL_NAME, {
        messageId: row.id,
        value: input.answer,
        ...(option.dataType === 'void' ? {} : { data: input.data }),
        resolvedBy,
        resolvedAt: resolvedAt.toISOString(),
      });
    } catch (error) {
      if (
        error instanceof WorkflowNotFoundError ||
        error instanceof TaskRunUnavailableError ||
        isNamespaceNotFoundError(error)
      ) {
        await this.tasks.update({ id: row.id }, { status: 'orphaned', orphanReason: (error as Error).message });
        await this.journal?.recordProblem({
          projectId: row.projectId,
          env: row.env,
          workflowId: row.workflowId,
          runId: row.runId,
          vendor: 'tasks',
          nodeId: row.nodeId,
          level: 'warn',
          message: `Task answer undeliverable: the run is gone (${(error as Error).message})`,
          data: {
            errorType: (error as Error).constructor.name,
            signal: HUMAN_TASK_ANSWER_SIGNAL_NAME,
            taskId: row.id,
            answer: input.answer,
            ...(option.dataType === 'void' ? {} : { answerData: input.data }),
          },
        });
      } else {
        const reopenedFields = {
          status: 'open',
          answer: null,
          answerData: null,
          resolvedBy: null,
          resolvedAt: null,
        } as unknown as QueryDeepPartialEntity<Task>;
        await this.tasks.update({ id: row.id, status: 'done' }, reopenedFields);
        throw error;
      }
    }

    const reloaded = await this.tasks.findOneBy({ id: row.id });
    if (!reloaded) throw new NotFoundException(`Task "${id}" not found`);
    return this.toApiTask(reloaded, project.name, await this.assigneeNames([reloaded]));
  }

  toApiTask(row: Task, projectName: string, assigneeNames: ReadonlyMap<string, string> = new Map()): IApiTask {
    return {
      id: row.id,
      projectId: row.projectId,
      projectName,
      env: row.env,
      workflowId: row.workflowId,
      runId: row.runId,
      taskQueue: row.taskQueue,
      nodeId: row.nodeId,
      title: row.title,
      description: row.description,
      payload: row.payload ?? null,
      attachments: row.attachments ?? [],
      options: row.options,
      status: row.status,
      answer: row.answer,
      answerData: row.answerData ?? null,
      resolvedBy: row.resolvedBy,
      assigneeId: row.assigneeId ?? null,
      assigneeName: row.assigneeId ? (assigneeNames.get(row.assigneeId) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
      dueAt: row.dueAt ? row.dueAt.toISOString() : null,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      orphanReason: row.orphanReason,
    };
  }
}
