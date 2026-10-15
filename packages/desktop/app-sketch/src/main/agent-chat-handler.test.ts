// oxlint-disable max-lines, require-await, no-promise-executor-return, no-await-expression-member, no-non-null-assertion, no-empty-function, no-undefined, consistent-type-imports, no-var-requires, prefer-module, prefer-event-target, consistent-function-scoping, init-declarations, no-useless-undefined -- test scaffolding: fake electron/BrowserWindow stand-ins, timer waits and loose fixtures read better with these stylistic rules off
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callOpenAiChat, getAgentSettings } = vi.hoisted(() => ({ callOpenAiChat: vi.fn(), getAgentSettings: vi.fn() }));
vi.mock('@falang/desktop-llm-client', () => ({ callOpenAiChat }));
vi.mock('./settings.js', () => ({ getAgentSettings }));

import { cancelAgentChat, runAgentChat } from './agent-chat-handler.js';

const params = { system: 'sys', messages: [], tools: [] };
const settings = { baseUrl: 'http://llm/v1', apiKey: 'k', model: 'm' };

describe('agent chat handler (ADR 0026 (private))', () => {
  beforeEach(() => {
    callOpenAiChat.mockReset();
    getAgentSettings.mockReset();
  });

  it('refuses to run when the agent is not configured (no settings / no baseUrl / no model)', async () => {
    getAgentSettings.mockResolvedValue(null);
    await expect(runAgentChat('r1', params)).rejects.toThrow(/Configure the agent/);
    getAgentSettings.mockResolvedValue({ ...settings, baseUrl: '' });
    await expect(runAgentChat('r2', params)).rejects.toThrow(/Configure the agent/);
    getAgentSettings.mockResolvedValue({ ...settings, model: '' });
    await expect(runAgentChat('r3', params)).rejects.toThrow(/Configure the agent/);
    expect(callOpenAiChat).not.toHaveBeenCalled();
  });

  it('passes the settings and request through to the vendor client and returns its result', async () => {
    getAgentSettings.mockResolvedValue(settings);
    callOpenAiChat.mockResolvedValue({ ok: true });
    await expect(runAgentChat('r1', params)).resolves.toEqual({ ok: true });
    expect(callOpenAiChat).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k', baseUrl: 'http://llm/v1', model: 'm', system: 'sys' }),
    );
  });

  it('cancelAgentChat aborts the in-flight request with that id only', async () => {
    getAgentSettings.mockResolvedValue(settings);
    const signals: Record<string, AbortSignal> = {};
    let release: () => void = () => {};
    callOpenAiChat.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      signals[`s${Object.keys(signals).length}`] = signal;
      return new Promise((resolve) => {
        release = () => resolve({ done: true });
      });
    });
    const first = runAgentChat('a', params);
    await vi.waitFor(() => expect(signals.s0).toBeDefined());
    cancelAgentChat('other');
    expect(signals.s0?.aborted).toBe(false);
    cancelAgentChat('a');
    expect(signals.s0?.aborted).toBe(true);
    release();
    await first;
    // After completion the id is forgotten: cancelling it is a harmless no-op.
    expect(() => cancelAgentChat('a')).not.toThrow();
  });

  it('forgets the request id even when the vendor call fails', async () => {
    getAgentSettings.mockResolvedValue(settings);
    callOpenAiChat.mockRejectedValue(new Error('boom'));
    await expect(runAgentChat('x', params)).rejects.toThrow('boom');
    expect(() => cancelAgentChat('x')).not.toThrow();
  });
});
