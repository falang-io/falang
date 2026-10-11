// oxlint-disable no-await-in-loop -- every loop below writes rows one at a time on purpose: all mutations run inside one serialized chain, and each iteration's sink callback must see its row already stored.
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, MoreThanOrEqual, type Repository } from 'typeorm';
import { Project } from '../../projects/projects/project.entity.js';
import { RUNNER_SESSION_SINK, type IRunnerSession, type IRunnerSessionSink } from './runner-session-hooks.js';
import { RunnerSession, type TRunnerSessionEndReason } from './runner-session.entity.js';

/** Identity of a runner Deployment as a session records it. */
export interface IRunnerSessionRunner {
  readonly deploymentName: string;
  readonly taskQueue: string;
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
  readonly buildId?: string | null;
  /** The Deployment's `metadata.creationTimestamp`, when the caller read it (reconcile only). */
  readonly createdAt?: Date;
}

/** What `RunnerProcessManager` needs from the session store — see `IRunnerProcessManagerParams.sessions`. */
export interface IRunnerSessionRecorder {
  open: (runner: IRunnerSessionRunner, startedAt?: Date) => Promise<void>;
  close: (deploymentName: string, reason: TRunnerSessionEndReason, endedAt?: Date) => Promise<void>;
}

export interface IListSessionsOptions {
  readonly limit?: number;
  /** Return only sessions that started strictly before this instant (cursor for "older"). */
  readonly before?: Date;
}

export interface IUserRunnerSession extends IRunnerSession {
  readonly projectName: string | null;
}

export const DEFAULT_SESSIONS_LIMIT = 100;
export const MAX_SESSIONS_LIMIT = 500;

const clampLimit = (limit: number | undefined): number =>
  Math.min(Math.max(Math.trunc(limit ?? DEFAULT_SESSIONS_LIMIT), 1), MAX_SESSIONS_LIMIT);

const withProjectName = (session: IRunnerSession, projectName: string | null): IUserRunnerSession => ({
  ...session,
  projectName,
});

const toSession = (row: RunnerSession): IRunnerSession => ({
  id: row.id,
  projectId: row.projectId,
  env: row.env,
  buildId: row.buildId,
  deploymentName: row.deploymentName,
  taskQueue: row.taskQueue,
  startedAt: row.startedAt,
  lastSeenAt: row.lastSeenAt,
  endedAt: row.endedAt,
  endReason: row.endReason,
});

/**
 * The durable record of how long each runner Deployment was up — ADR 0067 (private) §1. All mutations run one
 * at a time (a promise chain) so a start, a stop and a sweep's `reconcile` in the same process can't interleave
 * into a duplicate or a wrongly-closed session. Sink callbacks run after the row is written and never throw out.
 */
@Injectable()
export class RunnerSessionsService implements IRunnerSessionRecorder {
  private readonly logger = new Logger(RunnerSessionsService.name);
  private readonly sessions: Repository<RunnerSession>;
  private readonly projects: Repository<Project>;
  private readonly sink: IRunnerSessionSink | undefined;
  private readonly warnedOrphans = new Set<string>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    @InjectRepository(RunnerSession) sessions: Repository<RunnerSession>,
    @InjectRepository(Project) projects: Repository<Project>,
    @Optional() @Inject(RUNNER_SESSION_SINK) sink?: IRunnerSessionSink,
  ) {
    this.sessions = sessions;
    this.projects = projects;
    this.sink = sink;
  }

  /** Opens a session for a freshly created Deployment; a second `open` of one that is already open only heartbeats it. */
  open(runner: IRunnerSessionRunner, startedAt: Date = new Date()): Promise<void> {
    return this.serial(async () => {
      const existing = await this.sessions.findOneBy({ deploymentName: runner.deploymentName, endedAt: IsNull() });
      if (existing) {
        existing.lastSeenAt = startedAt > existing.lastSeenAt ? startedAt : existing.lastSeenAt;
        await this.sessions.save(existing);
        return;
      }
      await this.insert(runner, startedAt);
    });
  }

  /** Closes every open session of `deploymentName` (normally one). A no-op if none is open. */
  close(deploymentName: string, reason: TRunnerSessionEndReason, endedAt: Date = new Date()): Promise<void> {
    return this.serial(async () => {
      const open = await this.sessions.find({ where: { deploymentName, endedAt: IsNull() } });
      for (const row of open) await this.closeRow(row, reason, endedAt);
    });
  }

  closeAllOpen(reason: TRunnerSessionEndReason, endedAt: Date = new Date()): Promise<void> {
    return this.serial(async () => {
      const open = await this.sessions.find({ where: { endedAt: IsNull() } });
      for (const row of open) await this.closeRow(row, reason, endedAt);
    });
  }

  /**
   * Brings the table in line with the Deployments that really exist (`listRunning()` taken at `snapshotAt`):
   * heartbeats every open session whose Deployment is up; closes one whose Deployment is gone as `lost`, ended at its
   * `lastSeenAt` (the last moment we know it was up); opens a session for a Deployment nobody recorded (created before
   * a restart, or by an older backend), starting at its `createdAt`. A session that started — or was closed — after
   * `snapshotAt` is left alone: the snapshot predates it, so it says nothing about that session.
   */
  reconcile(running: readonly IRunnerSessionRunner[], now: Date = new Date(), snapshotAt: Date = now): Promise<void> {
    return this.serial(async () => {
      const open = await this.sessions.find({ where: { endedAt: IsNull() } });
      const runningByName = new Map(running.map((runner) => [runner.deploymentName, runner]));
      const openNames = new Set<string>();
      for (const row of open) {
        openNames.add(row.deploymentName);
        if (runningByName.has(row.deploymentName)) {
          row.lastSeenAt = now;
          await this.sessions.save(row);
          await this.notify('onHeartbeat', row);
        } else if (row.startedAt < snapshotAt) {
          await this.closeRow(row, 'lost', row.lastSeenAt);
        }
      }
      const closedAfterSnapshot = await this.sessions.find({ where: { endedAt: MoreThanOrEqual(snapshotAt) } });
      const recentlyClosed = new Set(closedAfterSnapshot.map((row) => row.deploymentName));
      const candidates = running.filter(
        (runner) => !openNames.has(runner.deploymentName) && !recentlyClosed.has(runner.deploymentName),
      );
      const known = await this.existingProjectIds(candidates.map((runner) => runner.projectId));
      for (const runner of candidates) {
        if (!known.has(runner.projectId)) {
          if (!this.warnedOrphans.has(runner.deploymentName)) {
            this.warnedOrphans.add(runner.deploymentName);
            this.logger.warn(
              `Runner Deployment ${runner.deploymentName} belongs to unknown project ${runner.projectId}; no session opened`,
            );
          }
          continue;
        }
        const createdAt = runner.createdAt && runner.createdAt < now ? runner.createdAt : now;
        await this.insert(runner, createdAt, now);
      }
    });
  }

  async listOpen(): Promise<IRunnerSession[]> {
    const rows = await this.sessions.find({ where: { endedAt: IsNull() }, order: { startedAt: 'ASC' } });
    return rows.map((row) => toSession(row));
  }

  /** Open sessions of one project (backs the runtime-settings state block). */
  async listOpenForProject(projectId: string): Promise<IRunnerSession[]> {
    const rows = await this.sessions.find({ where: { projectId, endedAt: IsNull() }, order: { startedAt: 'ASC' } });
    return rows.map((row) => toSession(row));
  }

  async listForProject(projectId: string, options: IListSessionsOptions = {}): Promise<IRunnerSession[]> {
    const rows = await this.sessions.find({
      where: { projectId, ...(options.before ? { startedAt: LessThan(options.before) } : {}) },
      order: { startedAt: 'DESC' },
      take: clampLimit(options.limit),
    });
    return rows.map((row) => toSession(row));
  }

  /** Sessions of every project the user owns, newest first, with the project's name. */
  async listForUser(userId: string, options: IListSessionsOptions = {}): Promise<IUserRunnerSession[]> {
    const projects = await this.projects.find({ select: { id: true, name: true }, where: { ownerId: userId } });
    if (projects.length === 0) return [];
    const names = new Map(projects.map((project) => [project.id, project.name]));
    const rows = await this.sessions.find({
      where: {
        projectId: In(projects.map((project) => project.id)),
        ...(options.before ? { startedAt: LessThan(options.before) } : {}),
      },
      order: { startedAt: 'DESC' },
      take: clampLimit(options.limit),
    });
    return rows.map((row) => withProjectName(toSession(row), names.get(row.projectId) ?? null));
  }

  private async existingProjectIds(ids: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Set();
    const rows = await this.projects.find({ select: { id: true }, where: { id: In(unique) } });
    return new Set(rows.map((row) => row.id));
  }

  private async insert(runner: IRunnerSessionRunner, startedAt: Date, lastSeenAt: Date = startedAt): Promise<void> {
    const row = await this.sessions.save(
      this.sessions.create({
        projectId: runner.projectId,
        env: runner.env,
        buildId: runner.buildId ?? null,
        deploymentName: runner.deploymentName,
        taskQueue: runner.taskQueue,
        startedAt,
        lastSeenAt,
        endedAt: null,
        endReason: null,
      }),
    );
    await this.notify('onOpened', row);
  }

  private async closeRow(row: RunnerSession, reason: TRunnerSessionEndReason, endedAt: Date): Promise<void> {
    row.endedAt = endedAt;
    row.endReason = reason;
    if (endedAt > row.lastSeenAt) row.lastSeenAt = endedAt;
    await this.sessions.save(row);
    await this.notify('onClosed', row);
  }

  private async notify(hook: keyof IRunnerSessionSink, row: RunnerSession): Promise<void> {
    if (!this.sink) return;
    try {
      await this.sink[hook](toSession(row));
    } catch (error) {
      this.logger.error(`Runner session sink ${hook} failed`, error instanceof Error ? error.stack : error);
    }
  }

  private serial(task: () => Promise<void>): Promise<void> {
    const next = this.chain.then(() => task());
    this.chain = next.catch(() => null);
    return next;
  }
}
