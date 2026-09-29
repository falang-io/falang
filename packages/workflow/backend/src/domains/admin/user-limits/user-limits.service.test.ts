import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { UserLimitsService } from './user-limits.service.js';
import type { UserLimits } from './user-limits.entity.js';

const DEFAULTS: Record<string, number> = {
  MAX_PROJECT_FILES_BYTES: 1_073_741_824,
  MAX_FILE_BYTES: 104_857_600,
  DEV_FILE_TTL_HOURS: 24,
  INGRESS_FILE_TTL_HOURS: 168,
  MAX_CONCURRENT_PROD_VERSIONS: 3,
};

const makeConfig = (): Pick<ConfigService, 'get'> => ({
  get: vi.fn((key: string, fallback?: unknown) => DEFAULTS[key] ?? fallback) as ConfigService['get'],
});

const makeRow = (overrides: Partial<UserLimits> = {}): UserLimits =>
  ({
    userId: 'user-1',
    maxProjectFilesBytes: null,
    maxFileBytes: null,
    devFileTtlHours: null,
    ingressFileTtlHours: null,
    maxConcurrentProdVersions: null,
    updatedAt: new Date(),
    ...overrides,
  }) as UserLimits;

describe('UserLimitsService', () => {
  // oxlint-disable-next-line init-declarations
  let repo: Pick<Repository<UserLimits>, 'findOneBy' | 'save'>;
  // oxlint-disable-next-line init-declarations
  let service: UserLimitsService;

  beforeEach(() => {
    repo = { findOneBy: vi.fn(), save: vi.fn() };
    service = new UserLimitsService(repo as Repository<UserLimits>, makeConfig() as ConfigService);
  });

  describe('getLimits', () => {
    it('returns the env defaults when no override row exists', async () => {
      vi.mocked(repo.findOneBy).mockResolvedValue(null);

      const limits = await service.getLimits('user-1');

      expect(limits).toEqual({
        maxProjectFilesBytes: 1_073_741_824,
        maxFileBytes: 104_857_600,
        devFileTtlHours: 24,
        ingressFileTtlHours: 168,
        maxConcurrentProdVersions: 3,
      });
    });

    it('merges a partial override row over the defaults', async () => {
      vi.mocked(repo.findOneBy).mockResolvedValue(makeRow({ maxProjectFilesBytes: 2_000_000_000 }));

      const limits = await service.getLimits('user-1');

      expect(limits.maxProjectFilesBytes).toBe(2_000_000_000);
      expect(limits.maxFileBytes).toBe(104_857_600);
      expect(limits.devFileTtlHours).toBe(24);
      expect(limits.ingressFileTtlHours).toBe(168);
    });
  });

  describe('getOverrides', () => {
    it('returns {} when no row exists', async () => {
      vi.mocked(repo.findOneBy).mockResolvedValue(null);

      const overrides = await service.getOverrides('user-1');

      expect(overrides).toEqual({});
    });

    it('returns only the non-null fields of an existing row', async () => {
      vi.mocked(repo.findOneBy).mockResolvedValue(makeRow({ maxProjectFilesBytes: 2_000_000_000, devFileTtlHours: 1 }));

      const overrides = await service.getOverrides('user-1');

      expect(overrides).toEqual({ maxProjectFilesBytes: 2_000_000_000, devFileTtlHours: 1 });
    });
  });

  describe('setOverrides', () => {
    it('creates a row on the first override, leaving every other field null', async () => {
      vi.mocked(repo.findOneBy).mockResolvedValue(null);
      vi.mocked(repo.save).mockImplementation((entity) => Promise.resolve(entity as UserLimits));

      await service.setOverrides('user-1', { maxFileBytes: 50_000_000 });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          maxProjectFilesBytes: null,
          maxFileBytes: 50_000_000,
          devFileTtlHours: null,
          ingressFileTtlHours: null,
          maxConcurrentProdVersions: null,
        }),
      );
    });

    it('overrides maxConcurrentProdVersions and reflects it in getLimits', async () => {
      vi.mocked(repo.findOneBy).mockResolvedValue(makeRow({ maxConcurrentProdVersions: 1 }));
      const limits = await service.getLimits('user-1');
      expect(limits.maxConcurrentProdVersions).toBe(1);
      expect(await service.getOverrides('user-1')).toEqual({ maxConcurrentProdVersions: 1 });
    });

    it('merges into an existing row without touching fields not provided', async () => {
      vi.mocked(repo.findOneBy).mockResolvedValue(makeRow({ maxProjectFilesBytes: 2_000_000_000 }));
      vi.mocked(repo.save).mockImplementation((entity) => Promise.resolve(entity as UserLimits));

      await service.setOverrides('user-1', { devFileTtlHours: 1 });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          maxProjectFilesBytes: 2_000_000_000,
          maxFileBytes: null,
          devFileTtlHours: 1,
          ingressFileTtlHours: null,
        }),
      );
    });

    it('clears a previously-set override with an explicit null', async () => {
      vi.mocked(repo.findOneBy).mockResolvedValue(makeRow({ maxProjectFilesBytes: 2_000_000_000 }));
      vi.mocked(repo.save).mockImplementation((entity) => Promise.resolve(entity as UserLimits));

      await service.setOverrides('user-1', { maxProjectFilesBytes: null });

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ maxProjectFilesBytes: null }));
    });
  });
});
