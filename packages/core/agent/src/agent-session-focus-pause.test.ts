import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentSession } from './agent-session.js';
import { FOCUS_PAUSE_MS } from './agent-session-internal.js';
import type { ILlmResponse } from './llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';

const bodyId = '2';

const runOneInsert = async (extra: { focusPauseMs?: number }): Promise<void> => {
  const scheme = schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule()],
  });
  const client = new ScriptedLlmClient([
    (): ILlmResponse => ({
      text: '',
      toolCalls: [{ id: 'a', input: { index: 0, name: 'action', parentId: bodyId }, name: 'insert_node' }],
    }),
    (): ILlmResponse => ({ text: '', toolCalls: [{ id: 'b', input: { message: 'done' }, name: 'finish' }] }),
  ]);
  const session = new AgentSession(scheme, client, [], extra);
  await session.run('go');
  expect(session.status).toBe('done');
  scheme.dispose();
};

const pauseDelays = (spy: { mock: { calls: unknown[][] } }): unknown[] =>
  spy.mock.calls.map((call) => call[1]).filter((delay: unknown) => typeof delay === 'number' && delay >= 5);

describe('AgentSession — focusPauseMs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to FOCUS_PAUSE_MS (300) after a mutating call', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await runOneInsert({});
    expect(pauseDelays(spy)).toContain(FOCUS_PAUSE_MS);
  });

  it('uses the configured value instead of the constant', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await runOneInsert({ focusPauseMs: 7 });
    expect(pauseDelays(spy)).toContain(7);
    expect(pauseDelays(spy)).not.toContain(FOCUS_PAUSE_MS);
  });

  it('0 skips the sleep entirely', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await runOneInsert({ focusPauseMs: 0 });
    expect(pauseDelays(spy)).not.toContain(FOCUS_PAUSE_MS);
    expect(pauseDelays(spy)).not.toContain(0);
  });
});
