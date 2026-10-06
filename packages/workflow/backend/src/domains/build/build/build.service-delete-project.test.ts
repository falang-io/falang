import { describe, expect, it, vi } from 'vitest';
import { BuildService } from './build.service.js';

type TArgs = ConstructorParameters<typeof BuildService>;

const makeService = (scheduleClient: { deleteAllForProject: ReturnType<typeof vi.fn> }) => {
  const order: string[] = [];
  const stub = (name: string) => vi.fn(() => {
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
    { removeProjectFiles: stub('files.remove') },
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
});
