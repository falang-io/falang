import { describe, expect, it, vi } from 'vitest';
import { BuildService } from './build.service.js';

type TArgs = ConstructorParameters<typeof BuildService>;

const makeService = (
  scheduleClient: { deleteAllForProject: ReturnType<typeof vi.fn> },
  filesRemove?: ReturnType<typeof vi.fn>,
) => {
  const order: string[] = [];
  const stub = (name: string) =>
    vi.fn(() => {
      order.push(name);
      return Promise.resolve();
    });
  const versions = { delete: stub('versions.delete') };
  const projectsService = { getOwnedProject: vi.fn().mockResolvedValue({}), delete: stub('project.delete') };
  const args = [
    {},
    projectsService,
    { stop: stub('runner.stop'), stopAll: stub('runner.stopAll') },
    {},
    {},
    { stopProjectIntegrations: vi.fn() },
    scheduleClient,
    {},
    {},
    {},
    {},
    versions,
    '/tmp/build',
    {},
    { removeProjectFiles: filesRemove ?? stub('files.remove') },
    { deleteProject: stub('journal.delete') },
  ] as unknown as TArgs;
  return { service: new BuildService(...args), order };
};

describe('BuildService.deleteProject', () => {
  it("deletes the project's schedules before its rows, so timers stop firing during the namespace grace period", async () => {
    const deleteAllForProject = vi.fn().mockResolvedValue(['sched-dev-1']);
    const { service, order } = makeService({ deleteAllForProject });

    await service.deleteProject('p1', 'owner-1');

    expect(deleteAllForProject).toHaveBeenCalledWith('p1');
    expect(order.at(-1)).toBe('project.delete');
  });

  it('still deletes the project when Temporal is unavailable for the schedule cleanup', async () => {
    const deleteAllForProject = vi.fn().mockRejectedValue(new Error('Temporal down'));
    const { service, order } = makeService({ deleteAllForProject });

    await service.deleteProject('p1', 'owner-1');

    expect(order).toContain('project.delete');
  });

  it('removes the project files (storage objects) before the project row', async () => {
    const { service, order } = makeService({ deleteAllForProject: vi.fn().mockResolvedValue([]) });

    await service.deleteProject('p1', 'owner-1');

    expect(order.indexOf('files.remove')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('files.remove')).toBeLessThan(order.indexOf('project.delete'));
  });

  it('does not delete the project row when removing its files fails', async () => {
    const filesRemove = vi.fn().mockRejectedValue(new Error('s3 down'));
    const { service, order } = makeService({ deleteAllForProject: vi.fn().mockResolvedValue([]) }, filesRemove);

    await expect(service.deleteProject('p1', 'owner-1')).rejects.toThrow('s3 down');

    expect(order).not.toContain('project.delete');
  });
});
