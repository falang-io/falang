// oxlint-disable no-undefined, unicorn/no-useless-undefined -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import type { Client } from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';
import { createSignalWorkflow } from './create-signal-workflow.js';

describe('createSignalWorkflow', () => {
  it("signals the run through the client of the project's own namespace, never another project's", async () => {
    const signalA = vi.fn().mockResolvedValue(undefined);
    const signalB = vi.fn().mockResolvedValue(undefined);
    const getHandleA = vi.fn(() => ({ signal: signalA }));
    const getHandleB = vi.fn(() => ({ signal: signalB }));
    const clients: Record<string, Client> = {
      'falang-a': { workflow: { getHandle: getHandleA } } as unknown as Client,
      'falang-b': { workflow: { getHandle: getHandleB } } as unknown as Client,
    };
    const getClientForNamespace = vi.fn((namespace: string) => Promise.resolve(clients[namespace] as Client));
    const signal = createSignalWorkflow({ namespaceFor: (projectId) => `falang-${projectId}`, getClientForNamespace });

    await signal('b', 'wf-1', 'run-1', 'humanTaskAnswer', { value: 'ok' });

    expect(getClientForNamespace).toHaveBeenCalledWith('falang-b');
    expect(getHandleB).toHaveBeenCalledWith('wf-1', 'run-1');
    expect(signalB).toHaveBeenCalledWith('humanTaskAnswer', { value: 'ok' });
    expect(getHandleA).not.toHaveBeenCalled();
  });
});
