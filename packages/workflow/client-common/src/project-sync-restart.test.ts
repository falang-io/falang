import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getProjectTree: vi.fn(),
  getDevStatus: vi.fn(),
  getProdStatus: vi.fn(),
  listVersions: vi.fn(),
  build: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('./api-client.js', () => ({
  workflowApi: api,
  ApiCompileErrorsError: Error,
  DocumentLockedError: Error,
}));

const { ProjectSync } = await import('./project-sync.js');

const makeSync = () =>
  new ProjectSync('p1', { onDocumentLockConflict: vi.fn(), getOwnLockOwner: () => 'tab' } as never, vi.fn(), vi.fn());

describe('ProjectSync.restartProject', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    api.getProjectTree.mockResolvedValue({ folders: [], documents: [] });
    api.getDevStatus.mockResolvedValue({ running: false });
    api.getProdStatus.mockResolvedValue({ running: false });
    api.listVersions.mockResolvedValue([]);
  });

  it('stops, then builds, ending in running', async () => {
    const order: string[] = [];
    api.stop.mockImplementation(() => {
      order.push('stop');
      return Promise.resolve();
    });
    api.build.mockImplementation(() => {
      order.push('build');
      return Promise.resolve({ taskQueue: 'q', terminatedExecutionsCount: 0 });
    });
    const sync = makeSync();

    await sync.restartProject();

    expect(order).toEqual(['stop', 'build']);
    expect(sync.buildStatus).toBe('running');
  });

  it('does not build after a failed stop and reports the error', async () => {
    api.stop.mockRejectedValue(new Error('boom'));
    const sync = makeSync();

    await sync.restartProject();

    expect(api.build).not.toHaveBeenCalled();
    expect(sync.buildStatus).toBe('error');
    expect(sync.connectionError).toBe('boom');
  });
});
