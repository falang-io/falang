import type { IProjectDocument } from '@falang/dto';
import { DEBUG_CONFIGURE_SIGNAL_NAME, DEBUG_RESUME_SIGNAL_NAME } from '@falang/workflow-compiler';
import { describe, expect, it, vi } from 'vitest';
import type { DocumentsService } from '../../projects/documents/documents.service.js';
import { DevArtifactStore } from '../build/dev-artifact-store.service.js';
import type { IEnsureRunnerRunningDeps } from '../build/ensure-runner-running.js';
import type { WorkflowRunService } from '../build/workflow-run.service.js';
import { DebugService } from './debug.service.js';
import type {
  TDebugSignalWithStart,
  TDescribeDebugWorkflow,
  TQueryDebugState,
  TSendDebugSignal,
  TTerminateDebugWorkflow,
} from './workflow-debug-client.js';

const PROJECT_ID = 'proj-1';
const OWNER_ID = 'owner-1';
const TASK_QUEUE = 'workflow-dev-proj-1';

const fakeDocument = (): IProjectDocument =>
  ({ id: 'doc-1', type: 'function', name: 'greet', root: { id: 'doc-1', name: 'function' } }) as IProjectDocument;

const fakeDocumentsService = (): DocumentsService =>
  ({ listFull: vi.fn(() => Promise.resolve([fakeDocument()])) }) as unknown as DocumentsService;

const fakeWorkflowRunService = (terminatedCount = 0): WorkflowRunService =>
  ({ terminateRunningOn: vi.fn(() => Promise.resolve(terminatedCount)) }) as unknown as WorkflowRunService;

/** A debug session's `ensureRunnerRunning` call is always `env: 'dev'` — only the dev branch's fields matter here (see `ensure-runner-running.ts`). */
const fakeEnsureRunnerDeps = (running: boolean): IEnsureRunnerRunningDeps =>
  ({
    runnerProcessManager: {
      touch: vi.fn(),
      isRunning: vi.fn(() => Promise.resolve(running)),
      start: vi.fn(() => Promise.resolve()),
    },
    devArtifacts: { has: vi.fn(() => true) },
    projectTokens: { getOrCreateToken: vi.fn(() => 'token') },
    versions: {},
    deploymentCli: {},
    startVersionRunnerIfNeeded: vi.fn(() => Promise.resolve()),
  }) as unknown as IEnsureRunnerRunningDeps;

interface IServiceParams {
  readonly devArtifacts?: DevArtifactStore;
  readonly workflowRunService?: WorkflowRunService;
  readonly ensureRunnerDeps?: IEnsureRunnerRunningDeps;
  readonly signalWithStartDebug?: TDebugSignalWithStart;
  readonly sendDebugSignal?: TSendDebugSignal;
  readonly describeDebugWorkflow?: TDescribeDebugWorkflow;
  readonly queryDebugState?: TQueryDebugState;
  readonly terminateDebugWorkflow?: TTerminateDebugWorkflow;
}

const createService = (overrides: IServiceParams = {}): DebugService =>
  new DebugService({
    documentsService: fakeDocumentsService(),
    devArtifacts: overrides.devArtifacts ?? new DevArtifactStore(),
    workflowRunService: overrides.workflowRunService ?? fakeWorkflowRunService(),
    ensureRunnerDeps: overrides.ensureRunnerDeps ?? fakeEnsureRunnerDeps(true),
    signalWithStartDebug: overrides.signalWithStartDebug ?? vi.fn(() => Promise.resolve({ runId: 'run-1' })),
    sendDebugSignal: overrides.sendDebugSignal ?? vi.fn(() => Promise.resolve()),
    describeDebugWorkflow: overrides.describeDebugWorkflow ?? vi.fn(() => Promise.resolve({ status: 'RUNNING', taskQueue: TASK_QUEUE })),
    queryDebugState: overrides.queryDebugState ?? vi.fn(() => Promise.resolve('unavailable' as const)),
    terminateDebugWorkflow: overrides.terminateDebugWorkflow ?? vi.fn(() => Promise.resolve()),
  });

const withDebugMapArtifact = (): DevArtifactStore => {
  const store = new DevArtifactStore();
  store.set(PROJECT_ID, {
    workflowBundle: '',
    activitiesSource: '',
    debugMap: {
      tracePoints: [
        { index: 0, documentId: 'doc-1', nodeId: 'n1', variables: [{ name: 'total', type: 'number' }] },
        { index: 1, documentId: 'doc-1', nodeId: 'n2', variables: [] },
      ],
    },
  });
  return store;
};

describe('DebugService.start', () => {
  it('throws NotFoundException when the function does not exist in the project', async () => {
    const service = createService();
    await expect(
      service.start(PROJECT_ID, OWNER_ID, { functionName: 'missing', args: [], breakpoints: [], pauseOnEntry: false }),
    ).rejects.toThrow(/not found/);
  });

  it('throws ConflictException when there is no dev build to debug', async () => {
    const service = createService({ devArtifacts: new DevArtifactStore() });
    await expect(
      service.start(PROJECT_ID, OWNER_ID, { functionName: 'greet', args: [], breakpoints: [], pauseOnEntry: false }),
    ).rejects.toThrow(/Build the project first/);
  });

  it('resolves breakpoints to trace indexes, wakes an idle dev pod, terminates other runs, and signals with start', async () => {
    const ensureRunnerDeps = fakeEnsureRunnerDeps(false);
    const workflowRunService = fakeWorkflowRunService(2);
    const signalWithStartDebug = vi.fn<TDebugSignalWithStart>(() => Promise.resolve({ runId: 'run-9' }));
    const service = createService({ devArtifacts: withDebugMapArtifact(), ensureRunnerDeps, workflowRunService, signalWithStartDebug });

    const result = await service.start(PROJECT_ID, OWNER_ID, {
      functionName: 'greet',
      args: [1, 'a'],
      breakpoints: [{ documentId: 'doc-1', nodeId: 'n2' }],
      pauseOnEntry: true,
    });

    expect(result).toEqual({
      workflowId: expect.stringContaining('debug-greet-'),
      runId: 'run-9',
      taskQueue: TASK_QUEUE,
      terminatedExecutionsCount: 2,
    });
    expect(ensureRunnerDeps.runnerProcessManager.start).toHaveBeenCalled();
    expect(workflowRunService.terminateRunningOn).toHaveBeenCalledWith('proj-1', TASK_QUEUE);
    expect(signalWithStartDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        taskQueue: TASK_QUEUE,
        functionName: 'greet',
        args: [1, 'a'],
        breakpoints: [1],
        pauseOnEntry: true,
      }),
    );
  });

  it('drops a breakpoint the debug map does not know about', async () => {
    const signalWithStartDebug = vi.fn<TDebugSignalWithStart>(() => Promise.resolve({ runId: 'run-1' }));
    const service = createService({ devArtifacts: withDebugMapArtifact(), signalWithStartDebug });

    await service.start(PROJECT_ID, OWNER_ID, {
      functionName: 'greet',
      args: [],
      breakpoints: [{ documentId: 'doc-1', nodeId: 'does-not-exist' }],
      pauseOnEntry: false,
    });

    expect(signalWithStartDebug).toHaveBeenCalledWith(expect.objectContaining({ breakpoints: [] }));
  });
});

describe('DebugService.getState', () => {
  it('throws NotFoundException when the workflow does not exist', async () => {
    const service = createService({ describeDebugWorkflow: vi.fn(() => Promise.resolve(null)) });
    await expect(service.getState(PROJECT_ID, OWNER_ID, 'debug-x')).rejects.toThrow(/not found/);
  });

  it('throws NotFoundException when the workflow belongs to a different task queue (cross-project)', async () => {
    const service = createService({
      describeDebugWorkflow: vi.fn(() => Promise.resolve({ status: 'RUNNING', taskQueue: 'workflow-dev-other' })),
    });
    await expect(service.getState(PROJECT_ID, OWNER_ID, 'debug-x')).rejects.toThrow(/not found/);
  });

  it('maps a paused query into a resolved location and typed variables', async () => {
    const service = createService({
      devArtifacts: withDebugMapArtifact(),
      queryDebugState: vi.fn(() =>
        Promise.resolve({ status: 'paused' as const, tracePoint: 0, depth: 1, variables: { total: 7 }, reason: 'breakpoint' as const }),
      ),
    });

    const state = await service.getState(PROJECT_ID, OWNER_ID, 'debug-x');

    expect(state).toEqual({
      status: 'paused',
      location: { documentId: 'doc-1', nodeId: 'n1' },
      variables: [{ name: 'total', type: 'number', value: 7 }],
      reason: 'breakpoint',
    });
  });

  it('reports "running" with no variables while the query says running', async () => {
    const service = createService({
      devArtifacts: withDebugMapArtifact(),
      queryDebugState: vi.fn(() =>
        Promise.resolve({ status: 'running' as const, tracePoint: 1, depth: 1, variables: {}, reason: null }),
      ),
    });

    const state = await service.getState(PROJECT_ID, OWNER_ID, 'debug-x');

    expect(state).toEqual({ status: 'running', location: { documentId: 'doc-1', nodeId: 'n2' }, variables: [], reason: null });
  });

  it('reports "runner-stopped" and wakes the pod when the query is unavailable', async () => {
    const ensureRunnerDeps = fakeEnsureRunnerDeps(false);
    const service = createService({ ensureRunnerDeps, queryDebugState: vi.fn(() => Promise.resolve('unavailable' as const)) });

    const state = await service.getState(PROJECT_ID, OWNER_ID, 'debug-x');

    expect(state).toEqual({ status: 'runner-stopped', location: null, variables: [], reason: null });
    expect(ensureRunnerDeps.runnerProcessManager.start).toHaveBeenCalled();
  });

  it('translates a terminal Temporal status into a termination reason, with a message for a failure', async () => {
    const service = createService({
      describeDebugWorkflow: vi.fn(() => Promise.resolve({ status: 'FAILED', taskQueue: TASK_QUEUE, failureMessage: 'boom' })),
    });

    const state = await service.getState(PROJECT_ID, OWNER_ID, 'debug-x');

    expect(state).toEqual({ status: 'failed', location: null, variables: [], reason: null, message: 'boom' });
  });

  it('maps TERMINATED/CANCELED/TIMED_OUT to "stopped"', async () => {
    const states = await Promise.all(
      ['TERMINATED', 'CANCELED', 'TIMED_OUT'].map((status) => {
        const service = createService({ describeDebugWorkflow: vi.fn(() => Promise.resolve({ status, taskQueue: TASK_QUEUE })) });
        return service.getState(PROJECT_ID, OWNER_ID, 'debug-x');
      }),
    );
    for (const state of states) expect(state.status).toBe('stopped');
  });
});

describe('DebugService.setBreakpoints / resume / stop', () => {
  it('setBreakpoints resolves locations and sends the configure signal with pauseOnEntry always false', async () => {
    const sendDebugSignal = vi.fn<TSendDebugSignal>(() => Promise.resolve());
    const service = createService({ devArtifacts: withDebugMapArtifact(), sendDebugSignal });

    await service.setBreakpoints(PROJECT_ID, OWNER_ID, 'debug-x', [{ documentId: 'doc-1', nodeId: 'n1' }]);

    expect(sendDebugSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'debug-x',
        signalName: DEBUG_CONFIGURE_SIGNAL_NAME,
        signalArgs: [{ breakpoints: [0], pauseOnEntry: false }],
      }),
    );
  });

  it('resume sends the resume signal with the given mode', async () => {
    const sendDebugSignal = vi.fn<TSendDebugSignal>(() => Promise.resolve());
    const service = createService({ sendDebugSignal });

    await service.resume(PROJECT_ID, OWNER_ID, 'debug-x', 'step-over');

    expect(sendDebugSignal).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'debug-x', signalName: DEBUG_RESUME_SIGNAL_NAME, signalArgs: [{ mode: 'step-over' }] }),
    );
  });

  it('stop terminates the workflow', async () => {
    const terminateDebugWorkflow = vi.fn<TTerminateDebugWorkflow>(() => Promise.resolve());
    const service = createService({ terminateDebugWorkflow });

    await service.stop(PROJECT_ID, OWNER_ID, 'debug-x');

    expect(terminateDebugWorkflow).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'debug-x' }));
  });

  it('every mutating route rejects a workflow belonging to a different project', async () => {
    const describeDebugWorkflow = vi.fn(() => Promise.resolve({ status: 'RUNNING', taskQueue: 'workflow-dev-other' }));
    const service = createService({ describeDebugWorkflow });

    await expect(service.setBreakpoints(PROJECT_ID, OWNER_ID, 'debug-x', [])).rejects.toThrow(/not found/);
    await expect(service.resume(PROJECT_ID, OWNER_ID, 'debug-x', 'continue')).rejects.toThrow(/not found/);
    await expect(service.stop(PROJECT_ID, OWNER_ID, 'debug-x')).rejects.toThrow(/not found/);
  });
});
