import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listProjectTemplates: vi.fn(),
  createProject: vi.fn(),
  createProjectFromTemplate: vi.fn(),
  importProject: vi.fn(),
  deleteProject: vi.fn(),
}));
vi.mock('./api-client.js', () => ({ workflowApi: api }));

const { ProjectListStore } = await import('./project-list-store.js');
const { eventTracker } = await import('./analytics/event-tracker.js');

const project = (id: string, createdAt: string, lastEditedAt: string | null = null) =>
  ({ id, name: id, createdAt, lastEditedAt }) as never;

const settle = async (n = 10): Promise<void> => {
  await Promise.resolve();
  if (n > 0) await settle(n - 1);
};

describe('ProjectListStore', () => {
  beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    api.listProjects.mockResolvedValue([]);
    api.listProjectTemplates.mockResolvedValue([]);
  });

  it('loads projects and templates on construction', async () => {
    api.listProjects.mockResolvedValue([project('a', '2026-01-01')]);
    api.listProjectTemplates.mockResolvedValue([{ id: 't', name: 'T', description: '' }]);
    const store = new ProjectListStore();
    expect(store.isLoading).toBe(true);
    await settle();
    expect(store.isLoading).toBe(false);
    expect(store.projects).toHaveLength(1);
    expect(store.templates.map((t) => t.id)).toEqual(['t']);
  });

  it('keeps an empty template list when loading templates fails', async () => {
    api.listProjectTemplates.mockRejectedValue(new Error('x'));
    const store = new ProjectListStore();
    await settle();
    expect(store.templates).toHaveLength(0);
    expect(store.error).toBeNull();
  });

  it('records the error when the project list fails', async () => {
    api.listProjects.mockRejectedValue(new Error('down'));
    const store = new ProjectListStore();
    await settle();
    expect(store.error).toBe('down');
    expect(store.isLoading).toBe(false);
    api.listProjects.mockRejectedValue('str');
    await store.load();
    expect(store.error).toBe('Failed to load projects');
  });

  it('sorts by last edit, falling back to creation time', async () => {
    api.listProjects.mockResolvedValue([
      project('old', '2026-01-01'),
      project('edited', '2026-01-02', '2026-03-01'),
      project('new', '2026-02-01'),
      project('bad', 'garbage'),
    ]);
    const store = new ProjectListStore();
    await settle();
    expect(store.sortedProjects.map((p) => p.id)).toEqual(['edited', 'new', 'old', 'bad']);
  });

  describe('createProjectFromTemplate', () => {
    it('adds the project and clears isCreating', async () => {
      const store = new ProjectListStore();
      await settle();
      api.createProjectFromTemplate.mockResolvedValue(project('n', '2026-01-01'));
      const created = await store.createProjectFromTemplate('tpl', 'N');
      expect(api.createProjectFromTemplate).toHaveBeenCalledWith('tpl', 'N');
      expect(created?.id).toBe('n');
      expect(store.projects.map((p) => p.id)).toEqual(['n']);
      expect(store.isCreating).toBe(false);
    });

    it('returns null and records the error on failure', async () => {
      const store = new ProjectListStore();
      await settle();
      api.createProjectFromTemplate.mockRejectedValue(new Error('no template'));
      expect(await store.createProjectFromTemplate('tpl', 'N')).toBeNull();
      expect(store.error).toBe('no template');
      expect(store.isCreating).toBe(false);
      expect(store.projects).toHaveLength(0);
      api.createProjectFromTemplate.mockRejectedValue('s');
      await store.createProjectFromTemplate('tpl', 'N');
      expect(store.error).toBe('Failed to create project');
    });
  });

  describe('createProject', () => {
    it('adds the project and tracks project_created', async () => {
      const store = new ProjectListStore();
      await settle();
      const track = vi.spyOn(eventTracker, 'track');
      api.createProject.mockResolvedValue(project('n', '2026-01-01'));
      const created = await store.createProject('N');
      expect(created?.id).toBe('n');
      expect(track).toHaveBeenCalledWith('project_created', { fromTemplate: false });
      track.mockRestore();
    });

    it('returns null on failure', async () => {
      const store = new ProjectListStore();
      await settle();
      api.createProject.mockRejectedValue(new Error('quota'));
      expect(await store.createProject('N')).toBeNull();
      expect(store.error).toBe('quota');
      expect(store.isCreating).toBe(false);
    });
  });

  describe('importProject', () => {
    it('adds the imported project', async () => {
      const store = new ProjectListStore();
      await settle();
      api.importProject.mockResolvedValue(project('i', '2026-01-01'));
      const imported = await store.importProject({} as never);
      expect(imported?.id).toBe('i');
      expect(store.projects).toHaveLength(1);
    });

    it('returns null on failure', async () => {
      const store = new ProjectListStore();
      await settle();
      api.importProject.mockRejectedValue('bad');
      expect(await store.importProject({} as never)).toBeNull();
      expect(store.error).toBe('Failed to import project');
    });
  });

  describe('deleteProject', () => {
    it('removes the project', async () => {
      api.listProjects.mockResolvedValue([project('a', '2026-01-01'), project('b', '2026-01-02')]);
      const store = new ProjectListStore();
      await settle();
      api.deleteProject.mockResolvedValue(null);
      expect(await store.deleteProject('a')).toBe(true);
      expect(store.projects.map((p) => p.id)).toEqual(['b']);
      expect(store.deletingId).toBeNull();
    });

    it('keeps the list and returns false on failure', async () => {
      api.listProjects.mockResolvedValue([project('a', '2026-01-01')]);
      const store = new ProjectListStore();
      await settle();
      api.deleteProject.mockRejectedValue(new Error('locked'));
      expect(await store.deleteProject('a')).toBe(false);
      expect(store.projects).toHaveLength(1);
      expect(store.error).toBe('locked');
      expect(store.deletingId).toBeNull();
    });
  });
});
