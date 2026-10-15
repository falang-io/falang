import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { UserLimitsService } from '../admin/user-limits/user-limits.service.js';
import type { IUserLimits } from '../admin/user-limits/user-limits.types.js';
import type { Project } from '../projects/projects/project.entity.js';
import { InMemoryFileStorage } from './in-memory-file-storage.js';
import type { File } from './file.entity.js';
import { FilesService } from './files.service.js';

const LIMITS: IUserLimits = {
  maxProjectFilesBytes: 1000,
  maxFileBytes: 100,
  devFileTtlHours: 24,
  ingressFileTtlHours: 168,
  maxConcurrentProdVersions: 3,
  maxIdleMinutes: 1440,
  alwaysOnAllowed: true,
};

const makeProjectRepo = (): Pick<Repository<Project>, 'findOneBy'> => ({
  findOneBy: vi.fn(() => Promise.resolve({ id: 'project-1', ownerId: 'owner-1' } as Project)),
});

describe('FilesService cleanup and reads', () => {
  const makeRow = (id: string, projectId = 'project-1', expiresAt: Date | null = null): File =>
    ({
      id,
      projectId,
      name: `${id}.txt`,
      size: 2,
      mime: 'text/plain',
      storageKey: `${projectId}/${id}`,
      createdBy: 'user:1',
      expiresAt,
      publicToken: null,
      createdAt: new Date(),
    }) as File;

  const build = (rows: File[], storageOverrides: Partial<InMemoryFileStorage> = {}) => {
    const calls: string[] = [];
    const storage = Object.assign(new InMemoryFileStorage(), storageOverrides);
    const repo = {
      find: vi.fn(() => Promise.resolve(rows)),
      remove: vi.fn(() => {
        calls.push('rows.remove');
        return Promise.resolve();
      }),
      findOneBy: vi.fn((where: { id?: string; publicToken?: string }) =>
        Promise.resolve(
          rows.find((r) => r.id === where.id || (where.publicToken && r.publicToken === where.publicToken)) ?? null,
        ),
      ),
    };
    const deleteMany = vi.fn((keys: readonly string[]) => {
      calls.push(`storage.deleteMany:${keys.join(',')}`);
      return Promise.resolve();
    });
    storage.deleteMany = deleteMany;
    const service = new FilesService(
      repo as unknown as Repository<File>,
      makeProjectRepo() as Repository<Project>,
      storage,
      { getLimits: vi.fn(() => Promise.resolve(LIMITS)) } as unknown as UserLimitsService,
      { get: vi.fn((_k: string, fallback?: unknown) => fallback) } as unknown as ConfigService,
    );
    return { service, repo, storage, deleteMany, calls };
  };

  it('removeExpired deletes storage objects of all rows first, then the rows', async () => {
    const rows = [makeRow('a'), makeRow('b')];
    const { service, calls } = build(rows);

    await expect(service.removeExpired(new Date())).resolves.toBe(2);

    expect(calls).toEqual(['storage.deleteMany:project-1/a,project-1/b', 'rows.remove']);
  });

  it('removeExpired with nothing expired touches neither storage nor rows', async () => {
    const { service, deleteMany, repo } = build([]);

    await expect(service.removeExpired(new Date())).resolves.toBe(0);

    expect(deleteMany).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('removeExpired keeps the rows when the storage delete fails', async () => {
    const { service, repo, storage } = build([makeRow('a')]);
    storage.deleteMany = vi.fn(() => Promise.reject(new Error('s3 down')));

    await expect(service.removeExpired(new Date())).rejects.toThrow('s3 down');

    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('removeProjectFiles deletes storage objects first, then the rows', async () => {
    const { service, calls } = build([makeRow('a'), makeRow('b')]);

    await service.removeProjectFiles('project-1');

    expect(calls).toEqual(['storage.deleteMany:project-1/a,project-1/b', 'rows.remove']);
  });

  it('removeProjectFiles on a project without files makes no storage call', async () => {
    const { service, deleteMany, repo } = build([]);

    await service.removeProjectFiles('project-1');

    expect(deleteMany).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('removeProjectFiles keeps the rows when the storage delete fails', async () => {
    const { service, repo, storage } = build([makeRow('a')]);
    storage.deleteMany = vi.fn(() => Promise.reject(new Error('s3 down')));

    await expect(service.removeProjectFiles('project-1')).rejects.toThrow('s3 down');

    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('getMeta returns the file ref, with publicUrl only when published', async () => {
    const row = makeRow('a');
    const { service } = build([row]);

    const ref = await service.getMeta('project-1', 'a');

    expect(ref).toMatchObject({ id: 'a', name: 'a.txt', size: 2, mime: 'text/plain' });
    expect(ref).not.toHaveProperty('publicUrl');
    await expect(service.getMeta('project-1', 'missing')).rejects.toThrow();
  });

  it('openStream returns the stored body', async () => {
    const row = makeRow('a');
    const { service, storage } = build([row]);
    await storage.putStream(row.storageKey, Readable.from(Buffer.from('hi')));

    const opened = await service.openStream('project-1', 'a');
    const chunks: Buffer[] = [];
    for await (const chunk of opened.body) chunks.push(Buffer.from(chunk as Buffer));

    expect(Buffer.concat(chunks).toString()).toBe('hi');
  });

  it('getPublic serves a published, unexpired file', async () => {
    const row = { ...makeRow('a'), publicToken: 'tok' } as File;
    const { service, storage } = build([row]);
    await storage.putStream(row.storageKey, Readable.from(Buffer.from('hi')));

    const opened = await service.getPublic('tok');

    expect(opened?.file.id).toBe('a');
  });
});
