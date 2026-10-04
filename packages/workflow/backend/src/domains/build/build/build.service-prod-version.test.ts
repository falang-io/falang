import { describe, expect, it, vi } from 'vitest';
import { BuildService } from './build.service.js';

type TArgs = ConstructorParameters<typeof BuildService>;

interface IVersionRow {
  readonly projectId: string;
  readonly versionNumber: number;
  readonly buildId: string;
}

const byNumberAsc = (a: IVersionRow, b: IVersionRow): number => a.versionNumber - b.versionNumber;

/**
 * Production's version (`Project.prodBuildId`) — what Start brings up, what Activate records and what
 * the Versions modal marks as current. Only the collaborators these paths touch are faked.
 */
const makeService = (params: { prodBuildId: string | null; versions: IVersionRow[]; runningBuildIds?: string[] }) => {
  const project = { id: 'p1', prodEnabled: false, prodBuildId: params.prodBuildId };
  const projectsService = {
    getOwnedProject: vi.fn(() => Promise.resolve(project)),
    getProdBuildId: vi.fn(() => Promise.resolve(project.prodBuildId)),
    setProdBuildId: vi.fn((_id: string, buildId: string | null) => {
      project.prodBuildId = buildId;
      return Promise.resolve();
    }),
    setProdEnabled: vi.fn(() => Promise.resolve(true)),
  };
  const versions = {
    find: vi.fn(() => Promise.resolve(params.versions.toSorted(byNumberAsc))),
    findOne: vi.fn(() => Promise.resolve(params.versions.toSorted(byNumberAsc).at(-1) ?? null)),
    findOneBy: vi.fn((where: Partial<IVersionRow>) =>
      Promise.resolve(
        params.versions.find((v) =>
          'buildId' in where ? v.buildId === where.buildId : v.versionNumber === where.versionNumber,
        ) ?? null,
      ),
    ),
  };
  const runnerProcessManager = {
    isRunning: vi.fn(() => Promise.resolve(true)),
    listRunningBuildIds: vi.fn(() => Promise.resolve(params.runningBuildIds ?? [])),
  };
  const deploymentCli = { setCurrentVersionWithRetry: vi.fn(() => Promise.resolve()) };
  const gatewayRuntime = { resumeProjectIntegrations: vi.fn() };
  const args = [
    {},
    projectsService,
    runnerProcessManager,
    deploymentCli,
    {},
    gatewayRuntime,
    {},
    {},
    {},
    {},
    {},
    versions,
    '/tmp/build',
    {},
    {},
  ] as unknown as TArgs;
  return { service: new BuildService(...args), project, deploymentCli, gatewayRuntime };
};

const V1 = { projectId: 'p1', versionNumber: 1, buildId: 'v1' };
const V2 = { projectId: 'p1', versionNumber: 2, buildId: 'v2' };

describe("BuildService — production's version", () => {
  it('Start brings up the recorded version (a rollback), not the latest', async () => {
    const { service, deploymentCli, project } = makeService({ prodBuildId: 'v1', versions: [V1, V2] });

    await service.startProd('p1', 'owner');

    expect(deploymentCli.setCurrentVersionWithRetry).toHaveBeenCalledWith('p1', 'workflow-p1', 'v1');
    expect(project.prodBuildId).toBe('v1');
  });

  it('Start falls back to the latest version when none is recorded', async () => {
    const { service, deploymentCli, project } = makeService({ prodBuildId: null, versions: [V1, V2] });

    await service.startProd('p1', 'owner');

    expect(deploymentCli.setCurrentVersionWithRetry).toHaveBeenCalledWith('p1', 'workflow-p1', 'v2');
    expect(project.prodBuildId).toBe('v2');
  });

  it('Activate records the version and turns production on', async () => {
    const { service, project, gatewayRuntime } = makeService({ prodBuildId: 'v2', versions: [V1, V2] });

    await service.activate('p1', 'owner', 1);

    expect(project.prodBuildId).toBe('v1');
    expect(gatewayRuntime.resumeProjectIntegrations).toHaveBeenCalledWith('p1', 'prod');
  });

  it('listVersions marks the current version and the ones with a live pod', async () => {
    const { service } = makeService({ prodBuildId: 'v1', versions: [V1, V2], runningBuildIds: ['v1', 'v2'] });

    const rows = await service.listVersions('p1', 'owner');

    expect(rows.map((row) => [row.buildId, row.current, row.running])).toEqual([
      ['v1', true, true],
      ['v2', false, true],
    ]);
  });
});
