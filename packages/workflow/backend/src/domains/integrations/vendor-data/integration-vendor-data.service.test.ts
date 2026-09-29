import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { IntegrationVendorDataService } from './integration-vendor-data.service.js';
import type { IntegrationVendorData } from './integration-vendor-data.entity.js';

type MockRepo = { findOneBy: ReturnType<typeof vi.fn>; find: ReturnType<typeof vi.fn> } & Record<
  'create' | 'save' | 'delete',
  ReturnType<typeof vi.fn>
>;

const row = (overrides: Partial<IntegrationVendorData>): IntegrationVendorData =>
  ({
    projectId: 'project-1',
    instanceId: 'inst-1',
    key: 'schema',
    vendor: 'postgres',
    data: {},
    updatedAt: new Date('2026-09-28T00:00:00.000Z'),
    ...overrides,
  }) as unknown as IntegrationVendorData;

/**
 * Plain unit test over a mocked `Repository` — same pattern as
 * `personal-access-tokens.service.test.ts` — since `IntegrationVendorDataService` is generic CRUD
 * with no vendor-specific logic worth exercising against a real database (that's covered by the
 * e2e block in `integration-field-options.e2e.test.ts`).
 */
describe('IntegrationVendorDataService', () => {
  // oxlint-disable-next-line init-declarations
  let repo: MockRepo;
  // oxlint-disable-next-line init-declarations
  let service: IntegrationVendorDataService;

  beforeEach(() => {
    repo = {
      findOneBy: vi.fn(),
      find: vi.fn(),
      create: vi.fn((value: unknown) => value),
      save: vi.fn((value: unknown) => Promise.resolve(value)),
      delete: vi.fn(() => Promise.resolve({})),
    };
    service = new IntegrationVendorDataService(repo as unknown as Repository<IntegrationVendorData>);
  });

  describe('get', () => {
    it('returns null when nothing is stored for the (project, instance, key)', async () => {
      repo.findOneBy.mockResolvedValue(null);

      const result = await service.get('project-1', 'inst-1', 'schema');

      expect(result).toBeNull();
      expect(repo.findOneBy).toHaveBeenCalledWith({ projectId: 'project-1', instanceId: 'inst-1', key: 'schema' });
    });

    it('returns the stored data when a row exists', async () => {
      repo.findOneBy.mockResolvedValue(row({ data: { tables: [] } }));

      const result = await service.get('project-1', 'inst-1', 'schema');

      expect(result).toEqual({ tables: [] });
    });
  });

  describe('getAll', () => {
    it('returns {} when nothing has ever been synced for the instance', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.getAll('project-1', 'inst-1');

      expect(result).toEqual({});
    });

    it('returns key -> data for every row of the instance', async () => {
      repo.find.mockResolvedValue([
        row({ key: 'schema', data: { tables: ['orders'] } }),
        row({ key: 'other', data: { foo: 'bar' } }),
      ]);

      const result = await service.getAll('project-1', 'inst-1');

      expect(result).toEqual({ schema: { tables: ['orders'] }, other: { foo: 'bar' } });
      expect(repo.find).toHaveBeenCalledWith({ where: { projectId: 'project-1', instanceId: 'inst-1' } });
    });
  });

  describe('set', () => {
    it('upserts by (project, instance, key), keeping the existing row when one is found', async () => {
      const existing = row({ vendor: 'postgres' });
      repo.findOneBy.mockResolvedValue(existing);

      await service.set('project-1', 'inst-1', 'postgres', 'schema', { tables: ['orders'] });

      expect(repo.create).toHaveBeenCalledWith({
        ...existing,
        projectId: 'project-1',
        instanceId: 'inst-1',
        key: 'schema',
        vendor: 'postgres',
        data: { tables: ['orders'] },
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('creates a fresh row when none exists yet', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await service.set('project-1', 'inst-1', 'postgres', 'schema', { tables: [] });

      expect(repo.create).toHaveBeenCalledWith({
        projectId: 'project-1',
        instanceId: 'inst-1',
        key: 'schema',
        vendor: 'postgres',
        data: { tables: [] },
      });
    });
  });

  describe('remove', () => {
    it('deletes by (project, instance, key)', async () => {
      await service.remove('project-1', 'inst-1', 'schema');

      expect(repo.delete).toHaveBeenCalledWith({ projectId: 'project-1', instanceId: 'inst-1', key: 'schema' });
    });
  });

  describe('removeForInstance', () => {
    it('deletes every key for the (project, instance)', async () => {
      await service.removeForInstance('project-1', 'inst-1');

      expect(repo.delete).toHaveBeenCalledWith({ projectId: 'project-1', instanceId: 'inst-1' });
    });
  });
});
