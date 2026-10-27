import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationsRuntimeService,
  SCHEDULE_CLIENT_PORT,
  type IScheduleClientPort,
  type IScheduleGuard,
} from '@falang/workflow-gateway';
import { minScheduleGapSeconds } from '@falang/workflow-integrations-schedule';
import { UserLimitsService } from '../../admin/user-limits/user-limits.service.js';
import { ProjectsService } from '../../projects/projects/projects.service.js';

/** Default `SCHEDULE_MIN_INTERVAL_SECONDS` (matches the editor's floor, `MIN_SCHEDULE_INTERVAL_SECONDS`). */
const DEFAULT_MIN_INTERVAL_SECONDS = 60;

/**
 * Server-side guard on every Temporal Schedule a vendor tries to create or update (security audit P1-3/P1-4), installed
 * into the gateway as its `IScheduleGuard`:
 * - cadence: the shortest gap between two fires must be at least `SCHEDULE_MIN_INTERVAL_SECONDS` (default 60) — covers
 *   interval schedules and any cron expression, including a 6-field one with seconds that the editor would have refused;
 * - quota: at most `maxSchedules` (`MAX_SCHEDULES`, default 20, per-user override) schedules across *all* the owner's
 *   projects and both environments. Updating an existing schedule never counts as a new one; creating one past the cap is
 *   refused. Because the reconcile loop walks documents in a fixed order and schedules created earlier are never evicted,
 *   the surplus ones are deterministic: the oldest-registered keep working.
 * The refusal message goes to the vendor's reconcile, which journals it once per distinct reason.
 */
@Injectable()
export class ScheduleLimitsService implements IScheduleGuard, OnModuleInit {
  private readonly runtime: IntegrationsRuntimeService;
  private readonly projects: ProjectsService;
  private readonly userLimits: UserLimitsService;
  private readonly scheduleClient: IScheduleClientPort;
  private readonly minIntervalSeconds: number;

  constructor(
    @Inject(IntegrationsRuntimeService) runtime: IntegrationsRuntimeService,
    @Inject(ProjectsService) projects: ProjectsService,
    @Inject(UserLimitsService) userLimits: UserLimitsService,
    @Inject(SCHEDULE_CLIENT_PORT) scheduleClient: IScheduleClientPort,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.runtime = runtime;
    this.projects = projects;
    this.userLimits = userLimits;
    this.scheduleClient = scheduleClient;
    const configured = Number(config.get<string>('SCHEDULE_MIN_INTERVAL_SECONDS'));
    this.minIntervalSeconds = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MIN_INTERVAL_SECONDS;
  }

  onModuleInit(): void {
    this.runtime.setScheduleGuard(this);
  }

  async assertAllowed(params: Parameters<IScheduleGuard['assertAllowed']>[0]): Promise<void> {
    const gap = minScheduleGapSeconds(params.spec);
    if (gap < this.minIntervalSeconds) {
      throw new Error(
        `Schedules may fire at most once every ${this.minIntervalSeconds} seconds (this one fires every ${gap} s)`,
      );
    }

    const ownerId = await this.projects.getOwnerId(params.projectId);
    const { maxSchedules } = await this.userLimits.getLimits(ownerId);
    const owned = await this.projects.list(ownerId);
    const perProject = await Promise.all(owned.map((project) => this.scheduleClient.listForProject(project.id)));
    const all = perProject.flat();
    if (all.some((state) => state.scheduleId === params.scheduleId)) return;
    if (all.length >= maxSchedules) {
      throw new Error(`Schedule limit reached (${maxSchedules} per account) — remove a schedule trigger first`);
    }
  }
}
