// oxlint-disable no-undefined, unicorn/no-useless-undefined, unicorn/consistent-function-scoping, unicorn/no-await-expression-member, unicorn/catch-error-name, oxc/no-map-spread -- test fakes: resolving/rejecting with nothing, small local helpers and one-off spreads read better than the lint-preferred shapes.
import { HttpException } from '@nestjs/common';
import { RunnerStartRefusedError } from '@falang/workflow-gateway';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildService } from './build.service.js';

vi.mock('./build-artifact.js', () => ({
  buildArtifact: vi.fn(() => Promise.resolve({ workflowBundle: 'bundle', activitiesSource: 'acts' })),
  cleanupOrphanedBuildDirs: vi.fn(),
  typeCheckInWorker: vi.fn(),
}));
vi.mock('./compile-project-documents.js', () => ({
  compileProjectStructure: vi.fn(() => ({ workflows: 'w', activities: 'a', debugMap: { tracePoints: [] } })),
  getIntegrationsForCompile: vi.fn(() => Promise.resolve([])),
  toGeneratedFiles: vi.fn(),
}));

type TArgs = ConstructorParameters<typeof BuildService>;

interface IOptions {
  readonly suspendedReason?: 'balance' | 'admin' | null;
  readonly devRunning?: boolean;
  readonly prodPodRunning?: boolean;
  readonly anyProdRunning?: boolean;
  readonly guard?: { assertCanStart: ReturnType<typeof vi.fn> } | undefined;
  readonly withGuard?: boolean;
}

const VERSION = { projectId: 'p1', versionNumber: 1, buildId: 'v1' };

const makeService = (options: IOptions = {}) => {
  const order: string[] = [];
  const assertCanStart = vi.fn(() => {
    order.push('guard');
    return Promise.resolve();
  });
  const guard = options.withGuard === false ? undefined : (options.guard ?? { assertCanStart });
  const project = { id: 'p1', prodEnabled: false, prodBuildId: 'v1', ownerId: 'owner-1' };
  const projectsService = {
    getOwnedProject: vi.fn(() => Promise.resolve(project)),
    getStartGateInfo: vi.fn(() =>
      Promise.resolve({ ownerId: 'owner-1', suspendedReason: options.suspendedReason ?? null }),
    ),
    getOwnerId: vi.fn(() => Promise.resolve('owner-1')),
    getProdBuildId: vi.fn(() => Promise.resolve('v1')),
    setProdBuildId: vi.fn(() => Promise.resolve()),
    setProdEnabled: vi.fn(() => Promise.resolve(true)),
    listProdEnabledIds: vi.fn(() => Promise.resolve([])),
    listSuspendedIds: vi.fn(() => Promise.resolve([])),
  };
  const runnerProcessManager = {
    isRunning: vi.fn((_queue: string, buildId?: string) =>
      Promise.resolve(buildId === undefined ? (options.devRunning ?? false) : (options.prodPodRunning ?? false)),
    ),
    isAnyRunning: vi.fn(() => Promise.resolve(options.anyProdRunning ?? false)),
    countRunning: vi.fn(() => Promise.resolve(0)),
    start: vi.fn(() => {
      order.push('start');
      return Promise.resolve();
    }),
    touch: vi.fn(),
    listRunning: vi.fn(() => Promise.resolve([])),
  };
  const deploymentCli = { setCurrentVersionWithRetry: vi.fn(() => Promise.resolve()) };
  const gatewayRuntime = {
    resumeProjectIntegrations: vi.fn(),
    setEnsureRunnerRunning: vi.fn(),
  };
  const devArtifacts = { has: vi.fn(() => true), set: vi.fn(() => order.push('artifact')), get: vi.fn() };
  const versions = {
    findOneBy: vi.fn(() => Promise.resolve(VERSION)),
    findOne: vi.fn(() => Promise.resolve(VERSION)),
    count: vi.fn(() => Promise.resolve(0)),
    create: vi.fn((value: object) => value),
    save: vi.fn((value: object) => {
      order.push('save');
      return Promise.resolve({ ...value, createdAt: new Date() });
    }),
  };
  const workflowRunService = {
    terminateRunningOn: vi.fn(() => Promise.resolve(0)),
    start: vi.fn(() => Promise.resolve({ workflowId: 'w', runId: 'r' })),
  };
  const args = [
    { listFull: vi.fn(() => Promise.resolve([])) },
    projectsService,
    runnerProcessManager,
    deploymentCli,
    workflowRunService,
    gatewayRuntime,
    {},
    {},
    devArtifacts,
    { getOrCreateToken: () => 'token' },
    { commit: vi.fn(() => Promise.resolve(null)), headCommit: vi.fn(() => Promise.resolve(null)) },
    versions,
    '/tmp/build',
    { getLimits: vi.fn(() => Promise.resolve({ maxConcurrentProdVersions: 3 })) },
    {},
    {},
    guard,
  ] as unknown as TArgs;
  const service = new BuildService(...args);
  return { service, guard, order, runnerProcessManager, versions, devArtifacts, gatewayRuntime, workflowRunService };
};

const call = (action: string, env: 'dev' | 'prod' = 'dev') => ({ projectId: 'p1', ownerId: 'owner-1', env, action });

describe('BuildService — runner start guard (ADR 0067)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('every path to RunnerProcessManager.start asks first, with its action', () => {
    it("build() → 'dev-start', before the artifact is stored or a pod started", async () => {
      const { service, guard, order } = makeService();
      await service.build('p1', 'owner-1');
      expect(guard?.assertCanStart).toHaveBeenCalledWith(call('dev-start'));
      expect(order).toEqual(['guard', 'artifact', 'start']);
    });

    it("startDevRun() → 'dev-run' when the pod has to be started", async () => {
      const { service, guard, runnerProcessManager } = makeService();
      vi.spyOn(service, 'resolveRunEntry').mockResolvedValue({ resolution: { runnable: true, args: [] } });
      await service.startDevRun('p1', 'owner-1', { functionName: 'f', args: [] });
      expect(guard?.assertCanStart).toHaveBeenCalledWith(call('dev-run'));
      expect(runnerProcessManager.start).toHaveBeenCalledTimes(1);
    });

    it('startDevRun() asks nothing while the dev pod is already running', async () => {
      const { service, guard, runnerProcessManager } = makeService({ devRunning: true });
      vi.spyOn(service, 'resolveRunEntry').mockResolvedValue({ resolution: { runnable: true, args: [] } });
      await service.startDevRun('p1', 'owner-1', { functionName: 'f', args: [] });
      expect(guard?.assertCanStart).not.toHaveBeenCalled();
      expect(runnerProcessManager.start).not.toHaveBeenCalled();
    });

    it("startProd() → 'prod-start'", async () => {
      const { service, guard, order } = makeService();
      await service.startProd('p1', 'owner-1');
      expect(guard?.assertCanStart).toHaveBeenCalledWith(call('prod-start', 'prod'));
      expect(order).toEqual(['guard', 'start']);
    });

    it("activate() → 'activate'", async () => {
      const { service, guard } = makeService();
      await service.activate('p1', 'owner-1', 1);
      expect(guard?.assertCanStart).toHaveBeenCalledWith(call('activate', 'prod'));
    });

    it("publish() with prod live → 'publish', once, before the version row is written", async () => {
      const { service, guard, order } = makeService({ anyProdRunning: true });
      await service.publish('p1', 'owner-1');
      expect(guard?.assertCanStart).toHaveBeenCalledTimes(1);
      expect(guard?.assertCanStart).toHaveBeenCalledWith(call('publish', 'prod'));
      expect(order.slice(0, 2)).toEqual(['guard', 'save']);
    });

    it('publish() with prod stopped starts nothing and asks nothing', async () => {
      const { service, guard, runnerProcessManager } = makeService({ anyProdRunning: false });
      await service.publish('p1', 'owner-1');
      expect(guard?.assertCanStart).not.toHaveBeenCalled();
      expect(runnerProcessManager.start).not.toHaveBeenCalled();
    });

    it("a trigger wake (ensureRunnerRunning) → 'wake'", async () => {
      const { service, guard } = makeService();
      await service.ensureRunnerRunning('p1', 'dev', 'workflow-dev-p1');
      expect(guard?.assertCanStart).toHaveBeenCalledWith(call('wake'));
      await service.ensureRunnerRunning('p1', 'prod', 'workflow-p1');
      expect(guard?.assertCanStart).toHaveBeenCalledWith(call('wake', 'prod'));
    });
  });

  describe("a guard's exception reaches the caller unchanged and nothing is started", () => {
    const refusal = new HttpException({ statusCode: 402, code: 'insufficient_balance', message: 'no money' }, 402);

    it.each([
      ['build', (s: BuildService) => s.build('p1', 'owner-1')],
      ['startProd', (s: BuildService) => s.startProd('p1', 'owner-1')],
      ['activate', (s: BuildService) => s.activate('p1', 'owner-1', 1)],
    ])('%s', async (_name, run) => {
      const { service, runnerProcessManager, devArtifacts } = makeService({
        guard: { assertCanStart: vi.fn(() => Promise.reject(refusal)) },
      });
      await expect(run(service)).rejects.toBe(refusal);
      expect(runnerProcessManager.start).not.toHaveBeenCalled();
      expect(devArtifacts.set).not.toHaveBeenCalled();
    });

    it('publish() leaves no half-published version behind', async () => {
      const { service, versions } = makeService({
        anyProdRunning: true,
        guard: { assertCanStart: vi.fn(() => Promise.reject(refusal)) },
      });
      await expect(service.publish('p1', 'owner-1')).rejects.toBe(refusal);
      expect(versions.save).not.toHaveBeenCalled();
    });
  });

  describe('suspension answers 423 on every path, before the guard', () => {
    const expect423 = async (promise: Promise<unknown>, reason: string): Promise<void> => {
      const error = await promise.then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(423);
      expect((error as HttpException).getResponse()).toMatchObject({ code: 'project_suspended', reason });
    };

    it.each([
      ['build', (s: BuildService) => s.build('p1', 'owner-1')],
      ['startProd', (s: BuildService) => s.startProd('p1', 'owner-1')],
      ['activate', (s: BuildService) => s.activate('p1', 'owner-1', 1)],
      ['wake (dev)', (s: BuildService) => s.ensureRunnerRunning('p1', 'dev', 'workflow-dev-p1')],
      ['wake (prod)', (s: BuildService) => s.ensureRunnerRunning('p1', 'prod', 'workflow-p1')],
    ])('%s', async (_name, run) => {
      const { service, guard, runnerProcessManager } = makeService({ suspendedReason: 'balance' });
      await expect423(run(service), 'balance');
      expect(guard?.assertCanStart).not.toHaveBeenCalled();
      expect(runnerProcessManager.start).not.toHaveBeenCalled();
    });

    it('startDevRun', async () => {
      const { service } = makeService({ suspendedReason: 'admin' });
      vi.spyOn(service, 'resolveRunEntry').mockResolvedValue({ resolution: { runnable: true, args: [] } });
      await expect423(service.startDevRun('p1', 'owner-1', { functionName: 'f', args: [] }), 'admin');
    });

    it('publish with prod live', async () => {
      const { service, versions } = makeService({ suspendedReason: 'admin', anyProdRunning: true });
      await expect423(service.publish('p1', 'owner-1'), 'admin');
      expect(versions.save).not.toHaveBeenCalled();
    });
  });

  it('works without any guard provided (community default allows everything)', async () => {
    const { service, runnerProcessManager } = makeService({ withGuard: false });
    await service.build('p1', 'owner-1');
    expect(runnerProcessManager.start).toHaveBeenCalledTimes(1);
  });

  describe('trigger wake refusals (no client to tell)', () => {
    const captureWake = (service: BuildService, gatewayRuntime: { setEnsureRunnerRunning: ReturnType<typeof vi.fn> }) => {
      service.onModuleInit();
      return gatewayRuntime.setEnsureRunnerRunning.mock.calls[0]?.[0] as (params: {
        projectId: string;
        env: 'dev' | 'prod';
        taskQueue: string;
      }) => Promise<void>;
    };

    it('a suspended project turns into a RunnerStartRefusedError the gateway will not signal through', async () => {
      const { service, gatewayRuntime } = makeService({ suspendedReason: 'balance' });
      const wake = captureWake(service, gatewayRuntime);
      await expect(wake({ projectId: 'p1', env: 'dev', taskQueue: 'workflow-dev-p1' })).rejects.toBeInstanceOf(
        RunnerStartRefusedError,
      );
    });

    it('so does a 402 from the cloud guard', async () => {
      const { service, gatewayRuntime } = makeService({
        guard: {
          assertCanStart: vi.fn(() =>
            Promise.reject(new HttpException({ statusCode: 402, code: 'insufficient_balance', message: 'x' }, 402)),
          ),
        },
      });
      const wake = captureWake(service, gatewayRuntime);
      await expect(wake({ projectId: 'p1', env: 'prod', taskQueue: 'workflow-p1' })).rejects.toBeInstanceOf(
        RunnerStartRefusedError,
      );
    });

    it('any other wake failure stays a plain error (the gateway keeps its best-effort signal)', async () => {
      const { service, gatewayRuntime } = makeService({
        guard: { assertCanStart: vi.fn(() => Promise.reject(new Error('db down'))) },
      });
      const wake = captureWake(service, gatewayRuntime);
      const error = await wake({ projectId: 'p1', env: 'dev', taskQueue: 'workflow-dev-p1' }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(RunnerStartRefusedError);
    });
  });
});
