import type { Client } from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';
import { createSignalWorkflowWithStart } from './signal-workflow.js';
import type { ITemporalTenancy } from './temporal-tenancy.js';

describe('createSignalWorkflowWithStart', () => {
  it("signals through the client of the signalling project's own namespace", async () => {
    const signalWithStart = vi.fn().mockResolvedValue({});
    const clientA = { workflow: { signalWithStart } } as unknown as Client;
    const clientB = { workflow: { signalWithStart: vi.fn() } } as unknown as Client;
    const getClient = vi.fn((projectId: string) => Promise.resolve(projectId === 'a' ? clientA : clientB));
    const tenancy = { mode: 'per-project', getClient } as unknown as ITemporalTenancy;

    await createSignalWorkflowWithStart(tenancy)({
      projectId: 'a',
      taskQueue: 'workflow-a',
      workflowId: 'wf-1',
      workflowType: 'onMessage',
      signalName: 'telegramMessage',
      signalArgs: [{ text: 'hi' }],
    });

    expect(getClient).toHaveBeenCalledWith('a');
    expect(signalWithStart).toHaveBeenCalledWith('onMessage', {
      workflowId: 'wf-1',
      taskQueue: 'workflow-a',
      signal: 'telegramMessage',
      signalArgs: [{ text: 'hi' }],
      args: [],
    });
    expect(clientB.workflow.signalWithStart).not.toHaveBeenCalled();
  });
});
