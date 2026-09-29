import { describe, expect, it, vi } from 'vitest';
import type { TGetWorkflowPosition } from './workflow-position.js';
import {
  WorkflowRunService,
  type TStartAndAwaitWorkflow,
  type TStartWorkflow,
  type TTerminateRunningExecutions,
} from './workflow-run.service.js';

const noopTerminateRunningExecutions = vi.fn<TTerminateRunningExecutions>(() => Promise.resolve(0));
const noopStartAndAwaitWorkflow = vi.fn<TStartAndAwaitWorkflow>(() => Promise.resolve({ status: 'completed', result: null }));
const noopStartWorkflow = vi.fn<TStartWorkflow>(() => Promise.resolve({ runId: 'run-1' }));
const noopGetWorkflowPosition = vi.fn<TGetWorkflowPosition>(() => Promise.resolve(null));
/** Every test only cares about one or two of the four closures — the rest default to no-ops. */
const baseParams = {
  startAndAwaitWorkflow: noopStartAndAwaitWorkflow,
  terminateRunningExecutions: noopTerminateRunningExecutions,
  startWorkflow: noopStartWorkflow,
  getWorkflowPosition: noopGetWorkflowPosition,
};

describe('WorkflowRunService', () => {
  it('starts the workflow on the given task queue with a generated workflowId and returns its result', async () => {
    const startAndAwaitWorkflow = vi.fn<TStartAndAwaitWorkflow>(() =>
      Promise.resolve({ status: 'completed', result: 42 }),
    );
    const service = new WorkflowRunService({
      ...baseParams,
      startAndAwaitWorkflow,
    });

    const result = await service.run('workflow-dev-p1', 'processOrder', ['abc']);

    expect(result).toEqual({
      workflowId: expect.stringContaining('manual-processOrder-'),
      taskQueue: 'workflow-dev-p1',
      status: 'completed',
      result: 42,
    });
    expect(startAndAwaitWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        taskQueue: 'workflow-dev-p1',
        functionName: 'processOrder',
        args: ['abc'],
        workflowId: result.workflowId,
      }),
    );
  });

  it('reports a failed execution with its message', async () => {
    const startAndAwaitWorkflow = vi.fn<TStartAndAwaitWorkflow>(() =>
      Promise.resolve({ status: 'failed', message: 'boom' }),
    );
    const service = new WorkflowRunService({
      ...baseParams,
      startAndAwaitWorkflow,
    });

    const result = await service.run('workflow-p1', 'greet', []);

    expect(result).toEqual(
      expect.objectContaining({ status: 'failed', message: 'boom', taskQueue: 'workflow-p1' }),
    );
  });

  it('reports a timeout when the workflow does not complete in time', async () => {
    const startAndAwaitWorkflow = vi.fn<TStartAndAwaitWorkflow>(
      () =>
        new Promise((resolve) => {
          // Resolves far later than the test's 5ms timeoutMs, so the race always times out
          // first; unref'd so the pending timer doesn't keep the test process alive.
          setTimeout(() => resolve({ status: 'completed', result: null }), 100_000).unref();
        }),
    );
    const service = new WorkflowRunService({
      ...baseParams,
      startAndAwaitWorkflow,
      timeoutMs: 5,
    });

    const result = await service.run('workflow-p1', 'greet', []);

    expect(result).toEqual(
      expect.objectContaining({ status: 'timeout', taskQueue: 'workflow-p1' }),
    );
  });

  it('passes temporalAddress/namespace through to startAndAwaitWorkflow', async () => {
    const startAndAwaitWorkflow = vi.fn<TStartAndAwaitWorkflow>(() =>
      Promise.resolve({ status: 'completed', result: null }),
    );
    const service = new WorkflowRunService({
      ...baseParams,
      startAndAwaitWorkflow,
      temporalAddress: 'temporal.internal:7233',
      namespace: 'prod',
    });

    await service.run('workflow-p1', 'greet', []);

    expect(startAndAwaitWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ temporalAddress: 'temporal.internal:7233', namespace: 'prod' }),
    );
  });

  it('terminates running executions on the given task queue and returns how many were terminated', async () => {
    const terminateRunningExecutions = vi.fn<TTerminateRunningExecutions>(() => Promise.resolve(2));
    const service = new WorkflowRunService({
      ...baseParams,
      terminateRunningExecutions,
    });

    const count = await service.terminateRunningOn('workflow-dev-p1');

    expect(count).toBe(2);
    expect(terminateRunningExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ taskQueue: 'workflow-dev-p1' }),
    );
  });

  it('passes temporalAddress/namespace through to terminateRunningExecutions', async () => {
    const terminateRunningExecutions = vi.fn<TTerminateRunningExecutions>(() => Promise.resolve(0));
    const service = new WorkflowRunService({
      ...baseParams,
      terminateRunningExecutions,
      temporalAddress: 'temporal.internal:7233',
      namespace: 'prod',
    });

    await service.terminateRunningOn('workflow-dev-p1');

    expect(terminateRunningExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ temporalAddress: 'temporal.internal:7233', namespace: 'prod' }),
    );
  });

  it('starts an execution without awaiting it and returns its ids', async () => {
    const startWorkflow = vi.fn<TStartWorkflow>(() => Promise.resolve({ runId: 'run-42' }));
    const service = new WorkflowRunService({ ...baseParams, startWorkflow, namespace: 'ns' });

    const started = await service.start('workflow-dev-p1', 'processOrder', [1]);

    expect(started).toEqual({
      workflowId: expect.stringContaining('manual-processOrder-'),
      runId: 'run-42',
      taskQueue: 'workflow-dev-p1',
    });
    expect(startWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ taskQueue: 'workflow-dev-p1', functionName: 'processOrder', args: [1], namespace: 'ns' }),
    );
  });

  it('resolves an execution’s position through the injected closure', async () => {
    const getWorkflowPosition = vi.fn<TGetWorkflowPosition>(() =>
      Promise.resolve({
        workflowId: 'w',
        runId: 'r',
        status: 'RUNNING',
        taskQueue: 'workflow-dev-p1',
        source: 'query',
        stack: [{ documentId: 'd1', nodeId: 'n1' }],
      }),
    );
    const service = new WorkflowRunService({ ...baseParams, getWorkflowPosition, temporalAddress: 'temporal:7233' });

    const position = await service.getPosition('w', 'r');

    expect(position?.stack).toEqual([{ documentId: 'd1', nodeId: 'n1' }]);
    expect(getWorkflowPosition).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'w', runId: 'r', temporalAddress: 'temporal:7233' }),
    );
  });
});
