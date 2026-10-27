import type { ConfigService } from '@nestjs/config';
import type { IntegrationsRuntimeService, IScheduleClientPort, IScheduleStateWithTarget } from '@falang/workflow-gateway';
import { describe, expect, it, vi } from 'vitest';
import type { UserLimitsService } from '../../admin/user-limits/user-limits.service.js';
import type { ProjectsService } from '../../projects/projects/projects.service.js';
import { ScheduleLimitsService } from './schedule-limits.service.js';

const state = (projectId: string, scheduleId: string): IScheduleStateWithTarget => ({
  scheduleId,
  projectId,
  env: 'dev',
  taskQueue: 'q',
  paused: false,
  nextFireTimes: [],
  lastFireTime: null,
  skippedOverlapCount: 0,
  missedCatchupCount: 0,
});

const make = (existing: Record<string, string[]>, maxSchedules: number, env: Record<string, string> = {}) => {
  const runtime = { setScheduleGuard: vi.fn() } as unknown as IntegrationsRuntimeService;
  const projects = {
    getOwnerId: vi.fn(() => Promise.resolve('owner')),
    list: vi.fn(() => Promise.resolve(Object.keys(existing).map((id) => ({ id })))),
  } as unknown as ProjectsService;
  const userLimits = { getLimits: vi.fn(() => Promise.resolve({ maxSchedules })) } as unknown as UserLimitsService;
  const client = {
    listForProject: vi.fn((projectId: string) =>
      Promise.resolve((existing[projectId] ?? []).map((id) => state(projectId, id))),
    ),
  } as unknown as IScheduleClientPort;
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const service = new ScheduleLimitsService(runtime, projects, userLimits, client, config);
  return { service, runtime };
};

const EVERY_15_MIN = { intervals: [{ every: '15 minutes' }] };
const call = (scheduleId: string, spec: Parameters<ScheduleLimitsService['assertAllowed']>[0]['spec'] = EVERY_15_MIN) => ({
  projectId: 'p1',
  env: 'dev' as const,
  scheduleId,
  spec,
});

describe('ScheduleLimitsService', () => {
  it('installs itself into the gateway on module init', () => {
    const { service, runtime } = make({}, 20);
    service.onModuleInit();
    expect(runtime.setScheduleGuard).toHaveBeenCalledWith(service);
  });

  it('refuses a cadence below the minimum (default 60 s), for intervals and for cron with seconds', async () => {
    const { service } = make({}, 20);
    await expect(service.assertAllowed(call('s', { intervals: [{ every: '30 seconds' }] }))).rejects.toThrow(/60 seconds/);
    await expect(
      service.assertAllowed(call('s', { cronExpressions: ['*/10 * * * * *'], timeZone: 'UTC' })),
    ).rejects.toThrow(/at most once every 60/);
    await expect(service.assertAllowed(call('s', { cronExpressions: ['* * * * *'], timeZone: 'UTC' }))).resolves.toBeUndefined();
  });

  it('honours SCHEDULE_MIN_INTERVAL_SECONDS', async () => {
    const { service } = make({}, 20, { SCHEDULE_MIN_INTERVAL_SECONDS: '1800' });
    await expect(service.assertAllowed(call('s'))).rejects.toThrow(/1800 seconds/);
  });

  it('refuses a new schedule once the owner holds maxSchedules across projects, but still updates an existing one', async () => {
    const { service } = make({ p1: ['a', 'b'], p2: ['c'] }, 3);
    await expect(service.assertAllowed(call('new'))).rejects.toThrow(/limit reached \(3/);
    await expect(service.assertAllowed(call('b'))).resolves.toBeUndefined();
  });

  it('allows a new schedule below the cap', async () => {
    const { service } = make({ p1: ['a'] }, 3);
    await expect(service.assertAllowed(call('new'))).resolves.toBeUndefined();
  });
});
