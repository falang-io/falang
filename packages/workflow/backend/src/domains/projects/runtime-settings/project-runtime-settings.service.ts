import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { UserLimitsService } from '../../admin/user-limits/user-limits.service.js';
import { RunnerSessionsService } from '../../build/runner-sessions/runner-sessions.service.js';
import { Project, type TSuspendedReason } from '../projects/project.entity.js';
import { ProjectsService } from '../projects/projects.service.js';

export const DEFAULT_RUNNER_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export interface IRuntimeEnvSettings {
  idleMinutes: number | null;
  alwaysOn: boolean;
}

/** `IApiRuntimeSettings` of the ADR 0067 (private) contract (dates as ISO strings). */
export interface IRuntimeSettings {
  dev: IRuntimeEnvSettings;
  prod: IRuntimeEnvSettings;
  defaults: { idleMinutes: number };
  limits: { maxIdleMinutes: number; alwaysOnAllowed: boolean };
  state: {
    dev: { running: boolean; since: string | null };
    prod: { running: boolean; instances: number; since: string | null };
  };
  suspendedReason: TSuspendedReason | null;
}

/** Effective idle policy of one project per env: ms to idle-stop after, or `null` = always on. */
export interface IProjectIdlePolicy {
  readonly dev: number | null;
  readonly prod: number | null;
}

const MINUTE_MS = 60_000;

const earliestStart = (sessions: readonly { startedAt: Date }[]): string | null =>
  sessions.length === 0 ? null : new Date(Math.min(...sessions.map((s) => s.startedAt.getTime()))).toISOString();

/**
 * Per-project runtime settings (ADR 0067 (private) §2): how long each env's runner may sit idle before the sweep stops
 * it, and the "always on" switch — both bounded by the *owner's* `UserLimitsService` limits. `RUNNER_IDLE_TIMEOUT_MS`
 * stays the default for a project that never set a value (and the whole behaviour of a self-hosted install).
 */
@Injectable()
export class ProjectRuntimeSettingsService {
  private readonly projects: Repository<Project>;
  private readonly projectsService: ProjectsService;
  private readonly userLimits: UserLimitsService;
  private readonly sessions: RunnerSessionsService;
  private readonly defaultIdleMs: number;

  constructor(
    @InjectRepository(Project) projects: Repository<Project>,
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(UserLimitsService) userLimits: UserLimitsService,
    @Inject(RunnerSessionsService) sessions: RunnerSessionsService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.projects = projects;
    this.projectsService = projectsService;
    this.userLimits = userLimits;
    this.sessions = sessions;
    this.defaultIdleMs = Number(config.get('RUNNER_IDLE_TIMEOUT_MS', DEFAULT_RUNNER_IDLE_TIMEOUT_MS));
  }

  private get defaultIdleMinutes(): number {
    return Math.max(1, Math.ceil(this.defaultIdleMs / MINUTE_MS));
  }

  /** Owner or admin (read-only) — `access` mirrors `TProjectAccess`. */
  async get(projectId: string, userId: string, access: 'edit' | 'read' = 'read'): Promise<IRuntimeSettings> {
    const project = await this.projectsService.getOwnedProject(projectId, userId, access);
    return this.build(project);
  }

  async update(
    projectId: string,
    userId: string,
    body: { dev: IRuntimeEnvSettings; prod: IRuntimeEnvSettings },
  ): Promise<IRuntimeSettings> {
    const project = await this.projectsService.getOwnedProject(projectId, userId, 'edit');
    const limits = await this.userLimits.getLimits(project.ownerId);
    for (const env of ['dev', 'prod'] as const) {
      const { idleMinutes, alwaysOn } = body[env];
      if (
        idleMinutes !== null &&
        (!Number.isInteger(idleMinutes) || idleMinutes < 1 || idleMinutes > limits.maxIdleMinutes)
      ) {
        throw new BadRequestException(
          `${env}.idleMinutes must be a whole number between 1 and ${limits.maxIdleMinutes}`,
        );
      }
      const stored = env === 'dev' ? project.alwaysOnDev : project.alwaysOnProd;
      // Turning it off is always allowed; an already-on switch is left alone (a lowered limit must not block saving other fields).
      if (alwaysOn && !stored && !limits.alwaysOnAllowed) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'always_on_not_allowed',
          message: 'Always-on servers are not available on your plan',
        });
      }
    }
    await this.projects.update(
      { id: projectId },
      {
        idleMinutesDev: body.dev.idleMinutes,
        alwaysOnDev: body.dev.alwaysOn,
        idleMinutesProd: body.prod.idleMinutes,
        alwaysOnProd: body.prod.alwaysOn,
      },
    );
    return this.build({
      ...project,
      idleMinutesDev: body.dev.idleMinutes,
      alwaysOnDev: body.dev.alwaysOn,
      idleMinutesProd: body.prod.idleMinutes,
      alwaysOnProd: body.prod.alwaysOn,
    });
  }

  /**
   * Effective idle policy for each of `projectIds` — one query for the projects plus one limits lookup per distinct
   * owner, used once per sweep tick. A stored setting beyond the owner's current limit is clamped to it, and "always on"
   * is ignored when the owner may no longer use it. Unknown projects fall back to the default.
   */
  async resolveIdlePolicies(projectIds: readonly string[]): Promise<Map<string, IProjectIdlePolicy>> {
    const result = new Map<string, IProjectIdlePolicy>();
    if (projectIds.length === 0) return result;
    const rows = await this.projects.find({ where: { id: In([...new Set(projectIds)]) } });
    const ownerIds = [...new Set(rows.map((row) => row.ownerId))];
    const limitsList = await Promise.all(ownerIds.map((ownerId) => this.userLimits.getLimits(ownerId)));
    const limitsByOwner = new Map(ownerIds.map((ownerId, index) => [ownerId, limitsList[index]]));
    for (const row of rows) {
      const limits = limitsByOwner.get(row.ownerId);
      const resolveEnv = (idleMinutes: number | null, alwaysOn: boolean): number | null => {
        if (alwaysOn && limits?.alwaysOnAllowed !== false) return null;
        if (idleMinutes === null) return this.defaultIdleMs;
        const capped = limits ? Math.min(idleMinutes, limits.maxIdleMinutes) : idleMinutes;
        return capped * MINUTE_MS;
      };
      result.set(row.id, {
        dev: resolveEnv(row.idleMinutesDev, row.alwaysOnDev),
        prod: resolveEnv(row.idleMinutesProd, row.alwaysOnProd),
      });
    }
    return result;
  }

  /** Default policy for a project the lookup didn't find. */
  get defaultPolicy(): IProjectIdlePolicy {
    return { dev: this.defaultIdleMs, prod: this.defaultIdleMs };
  }

  private async build(project: Project): Promise<IRuntimeSettings> {
    const [limits, open] = await Promise.all([
      this.userLimits.getLimits(project.ownerId),
      this.sessions.listOpenForProject(project.id),
    ]);
    const dev = open.filter((session) => session.env === 'dev');
    const prod = open.filter((session) => session.env === 'prod');
    return {
      dev: { idleMinutes: project.idleMinutesDev, alwaysOn: project.alwaysOnDev },
      prod: { idleMinutes: project.idleMinutesProd, alwaysOn: project.alwaysOnProd },
      defaults: { idleMinutes: this.defaultIdleMinutes },
      limits: { maxIdleMinutes: limits.maxIdleMinutes, alwaysOnAllowed: limits.alwaysOnAllowed },
      state: {
        dev: { running: dev.length > 0, since: earliestStart(dev) },
        prod: { running: prod.length > 0, instances: prod.length, since: earliestStart(prod) },
      },
      suspendedReason: project.suspendedReason,
    };
  }
}
