import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayloadTooLargeException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { UserLimitsService } from '../admin/user-limits/user-limits.service.js';
import type { IUserLimits } from '../admin/user-limits/user-limits.types.js';
import type { Project } from '../projects/projects/project.entity.js';
import { InMemoryFileStorage } from './in-memory-file-storage.js';
import { resolveExpiresAt } from './file-ttl.js';
import type { File } from './file.entity.js';
import { FilesService } from './files.service.js';

const LIMITS: IUserLimits = {
  maxProjectFilesBytes: 1000,
  maxFileBytes: 100,
  devFileTtlHours: 24,
  ingressFileTtlHours: 168,
  maxConcurrentProdVersions: 3,
};

interface MockFileRepo {
  findOneBy: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  createQueryBuilder: ReturnType<typeof vi.fn>;
}

const makeFileRepo = (usedBytes = 0): MockFileRepo => {
  const rows = new Map<string, File>();
  const queryBuilder = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(() => Promise.resolve({ total: usedBytes })),
  };
  return {
    findOneBy: vi.fn((where: { id?: string; projectId?: string; publicToken?: string }) => {
      if (typeof where.publicToken === 'string') {
        for (const row of rows.values()) if (row.publicToken === where.publicToken) return Promise.resolve(row);
        return Promise.resolve(null);
      }
      return Promise.resolve(rows.get(String(where.id)) ?? null);
    }),
    find: vi.fn(() => Promise.resolve([...rows.values()])),
    // Mirrors what real TypeORM does at insert time for an unset `@CreateDateColumn` — this mock
    // bypasses TypeORM's own persistence layer entirely, so nothing else would ever populate it.
    create: vi.fn((value: Partial<File>) => ({ createdAt: new Date(), ...value }) as File),
    save: vi.fn((value: File) => {
      rows.set(value.id, value);
      return Promise.resolve(value);
    }),
    remove: vi.fn((value: File) => {
      rows.delete(value.id);
      return Promise.resolve(value);
    }),
    createQueryBuilder: vi.fn(() => queryBuilder),
  };
};

const makeProjectRepo = (): Pick<Repository<Project>, 'findOneBy'> => ({
  findOneBy: vi.fn(() => Promise.resolve({ id: 'project-1', ownerId: 'owner-1' } as Project)),
});

const readableFrom = (text: string): Readable => Readable.from(Buffer.from(text));

/** A `Readable` that emits `chunks` one at a time on the microtask queue, then errors — for asserting an aborted upload's *source* error also propagates (not just the guard `Transform`'s own limit check). */
const readableThatErrors = (chunks: readonly string[], error: Error): Readable => {
  let index = 0;
  return new Readable({
    read() {
      if (index < chunks.length) {
        this.push(Buffer.from(chunks[index]));
        index += 1;
        return;
      }
      process.nextTick(() => this.destroy(error));
    },
  });
};

describe('FilesService', () => {
  // oxlint-disable-next-line init-declarations
  let fileRepo: MockFileRepo;
  // oxlint-disable-next-line init-declarations
  let storage: InMemoryFileStorage;
  // oxlint-disable-next-line init-declarations
  let service: FilesService;
  // oxlint-disable-next-line init-declarations
  let userLimits: Pick<UserLimitsService, 'getLimits'>;

  beforeEach(() => {
    fileRepo = makeFileRepo();
    storage = new InMemoryFileStorage();
    userLimits = { getLimits: vi.fn(() => Promise.resolve(LIMITS)) };
    const config: Pick<ConfigService, 'get'> = {
      get: vi.fn((_key: string, fallback?: unknown) => fallback) as ConfigService['get'],
    };
    service = new FilesService(
      fileRepo as unknown as Repository<File>,
      makeProjectRepo() as Repository<Project>,
      storage,
      userLimits as UserLimitsService,
      config as ConfigService,
    );
  });

  describe('upload', () => {
    it('streams the file through and returns an IApiFile', async () => {
      const result = await service.upload('project-1', readableFrom('hello world'), {
        name: 'hello.txt',
        mime: 'text/plain',
        createdBy: 'user:1',
      });

      expect(result.name).toBe('hello.txt');
      expect(result.mime).toBe('text/plain');
      expect(result.size).toBe(11);
      expect(result.publicUrl).toBeNull();
      expect(storage.size).toBe(1);
    });

    it('aborts and leaves no object when the stream exceeds the per-file limit', async () => {
      const big = 'x'.repeat(LIMITS.maxFileBytes + 1);

      await expect(
        service.upload('project-1', readableFrom(big), {
          name: 'big.bin',
          mime: 'application/octet-stream',
          createdBy: 'user:1',
        }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(storage.size).toBe(0);
      expect(fileRepo.save).not.toHaveBeenCalled();
    });

    it('aborts and leaves no object when the stream exceeds the project quota', async () => {
      fileRepo = makeFileRepo(LIMITS.maxProjectFilesBytes - 5);
      service = new FilesService(
        fileRepo as unknown as Repository<File>,
        makeProjectRepo() as Repository<Project>,
        storage,
        userLimits as UserLimitsService,
        { get: vi.fn((_key: string, fallback?: unknown) => fallback) } as unknown as ConfigService,
      );

      await expect(
        service.upload('project-1', readableFrom('0123456789'), {
          name: 'over-quota.bin',
          mime: 'application/octet-stream',
          createdBy: 'user:1',
        }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      expect(storage.size).toBe(0);
    });

    it('propagates a broken source stream instead of hanging', async () => {
      await expect(
        service.upload('project-1', readableThatErrors(['abc'], new Error('boom')), {
          name: 'broken.bin',
          mime: 'application/octet-stream',
          createdBy: 'user:1',
        }),
      ).rejects.toThrow('boom');
      expect(storage.size).toBe(0);
    });
  });

  describe('publish/unpublish', () => {
    it('is idempotent — re-publishing returns the same publicUrl', async () => {
      const uploaded = await service.upload('project-1', readableFrom('hi'), {
        name: 'a.txt',
        mime: 'text/plain',
        createdBy: 'user:1',
      });

      const first = await service.publish('project-1', uploaded.id);
      const second = await service.publish('project-1', uploaded.id);

      expect(first.publicUrl).not.toBeNull();
      expect(second.publicUrl).toBe(first.publicUrl);
    });

    it('unpublish clears publicUrl without deleting the file', async () => {
      const uploaded = await service.upload('project-1', readableFrom('hi'), {
        name: 'a.txt',
        mime: 'text/plain',
        createdBy: 'user:1',
      });
      await service.publish('project-1', uploaded.id);

      const unpublished = await service.unpublish('project-1', uploaded.id);

      expect(unpublished.publicUrl).toBeNull();
      expect(storage.size).toBe(1);
    });
  });

  describe('getPublic', () => {
    it('returns null for an unknown token', async () => {
      await expect(service.getPublic('does-not-exist')).resolves.toBeNull();
    });

    it('returns null once the file has expired', async () => {
      const uploaded = await service.upload('project-1', readableFrom('hi'), {
        name: 'a.txt',
        mime: 'text/plain',
        createdBy: 'ingress:telegram',
        ttlSeconds: -1,
      });
      const published = await service.publish('project-1', uploaded.id);
      const publicToken = published.publicUrl?.split('/').pop();

      await expect(service.getPublic(String(publicToken))).resolves.toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes both the object and the row', async () => {
      const uploaded = await service.upload('project-1', readableFrom('hi'), {
        name: 'a.txt',
        mime: 'text/plain',
        createdBy: 'user:1',
      });

      await service.remove('project-1', uploaded.id);

      expect(storage.size).toBe(0);
      await expect(service.get('project-1', uploaded.id)).rejects.toThrow();
    });
  });
});

describe('resolveExpiresAt (TTL rule)', () => {
  const now = new Date('2026-09-28T00:00:00.000Z');

  it('an explicit ttlSeconds always wins', () => {
    const result = resolveExpiresAt(now, { ttlSeconds: 60, createdBy: 'ingress:telegram' }, LIMITS);
    expect(result?.getTime()).toBe(now.getTime() + 60_000);
  });

  it('a dev run upload gets devFileTtlHours', () => {
    const result = resolveExpiresAt(now, { createdBy: 'run:wf-1', workflowEnv: 'dev' }, LIMITS);
    expect(result?.getTime()).toBe(now.getTime() + LIMITS.devFileTtlHours * 3_600_000);
  });

  it('a prod run upload never expires', () => {
    const result = resolveExpiresAt(now, { createdBy: 'run:wf-1', workflowEnv: 'prod' }, LIMITS);
    expect(result).toBeNull();
  });

  it('a Telegram ingress upload gets ingressFileTtlHours', () => {
    const result = resolveExpiresAt(now, { createdBy: 'ingress:telegram' }, LIMITS);
    expect(result?.getTime()).toBe(now.getTime() + LIMITS.ingressFileTtlHours * 3_600_000);
  });

  it('a manual upload never expires', () => {
    const result = resolveExpiresAt(now, { createdBy: 'user:1' }, LIMITS);
    expect(result).toBeNull();
  });
});
