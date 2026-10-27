import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { UserLimits } from './user-limits.entity.js';
import type { IUserLimits, IUserLimitsOverrides } from './user-limits.types.js';

const OVERRIDE_KEYS = [
  'maxProjectFilesBytes',
  'maxFileBytes',
  'devFileTtlHours',
  'ingressFileTtlHours',
  'maxConcurrentProdVersions',
  'maxIdleMinutes',
  'alwaysOnAllowed',
  'maxProjects',
  'maxDevPods',
  'maxStoredVersions',
  'maxOwnerFilesBytes',
  'maxSchedules',
] as const;

/**
 * Merges the env-level defaults with a per-user `user_limits` override row — see
 * ADR 0038 (private) §2. `getLimits` is what `FilesService`/the GC
 * sweep resolve on every upload/TTL decision (through the *project owner*, not the calling user —
 * see that ADR); `getOverrides`/`setOverrides` back the admin `GET`/`PUT /admin/users/:id/limits`
 * routes. A user with no row gets pure env defaults; `setOverrides` with every field `null` leaves
 * an all-null row rather than deleting it — `getLimits`/`getOverrides` treat that identically to no
 * row at all.
 */
@Injectable()
export class UserLimitsService {
  private readonly repo: Repository<UserLimits>;
  private readonly defaults: IUserLimits;

  constructor(
    @InjectRepository(UserLimits) repo: Repository<UserLimits>,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.repo = repo;
    this.defaults = {
      maxProjectFilesBytes: config.get<number>('MAX_PROJECT_FILES_BYTES', 1_073_741_824),
      maxFileBytes: config.get<number>('MAX_FILE_BYTES', 104_857_600),
      devFileTtlHours: config.get<number>('DEV_FILE_TTL_HOURS', 24),
      ingressFileTtlHours: config.get<number>('INGRESS_FILE_TTL_HOURS', 168),
      maxConcurrentProdVersions: config.get<number>('MAX_CONCURRENT_PROD_VERSIONS', 3),
      maxIdleMinutes: config.get<number>('MAX_IDLE_MINUTES', 1440),
      alwaysOnAllowed: String(config.get<string | boolean>('ALWAYS_ON_ALLOWED', true)) !== 'false',
      maxProjects: config.get<number>('MAX_PROJECTS', 100),
      maxDevPods: config.get<number>('MAX_DEV_PODS', 3),
      maxStoredVersions: config.get<number>('MAX_STORED_VERSIONS', 50),
      maxOwnerFilesBytes: config.get<number>('MAX_OWNER_FILES_BYTES', 10_737_418_240),
      maxSchedules: config.get<number>('MAX_SCHEDULES', 20),
    };
  }

  async getLimits(userId: string): Promise<IUserLimits> {
    const overrides = await this.getOverrides(userId);
    return { ...this.defaults, ...overrides };
  }

  async getOverrides(userId: string): Promise<Partial<IUserLimits>> {
    const row = await this.repo.findOneBy({ userId });
    if (!row) return {};
    const overrides: Record<string, number | boolean> = {};
    for (const key of OVERRIDE_KEYS) {
      const value = row[key];
      if (value !== null) overrides[key] = value;
    }
    return overrides as Partial<IUserLimits>;
  }

  /** A field set to `null` clears that override; an omitted field leaves it untouched. */
  async setOverrides(userId: string, partial: IUserLimitsOverrides): Promise<void> {
    const existing = await this.repo.findOneBy({ userId });
    const next = { userId, updatedAt: existing?.updatedAt ?? new Date() } as unknown as Record<string, unknown>;
    for (const key of OVERRIDE_KEYS) {
      next[key] = key in partial ? (partial[key] ?? null) : (existing?.[key] ?? null);
    }
    await this.repo.save(next as unknown as UserLimits);
  }
}
