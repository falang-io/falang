/* oxlint-disable no-plusplus, no-undefined, no-void, no-empty-function, require-await, no-inline-comments, no-non-null-assertion, no-explicit-any */
import { ApplicationFailure } from '@temporalio/activity';
import { describe, expect, it } from 'vitest';
import { wrapActivitiesWithJournal } from './journal-activities.js';
import { journalNodeStorage } from './journal-sink.js';
import type { IJournalWireEntry } from './journal-types.js';

const setup = (activities: Record<string, unknown>, extra: object = {}) => {
  const entries: IJournalWireEntry[] = [];
  const wrapped = wrapActivitiesWithJournal(activities, {
    buffer: { push: (e) => entries.push(e) },
    vendors: { aiText: 'openai', tgSend: 'telegram', boom: 'telegram', plain: 'x' },
    specs: {
      aiText: { kind: 'ai', args: ['model', 'prompt'] },
      tgSend: { kind: 'message-out', args: ['chatId', 'text'] },
    },
    params: { aiText: ['credentialId', 'model', 'prompt'], tgSend: ['credentialId', 'chatId', 'text', 'headers'] },
    now: () => 1000,
    getInfo: () => ({ activityId: '5', attempt: 2, workflowId: 'wf', runId: 'run1' }),
    ...extra,
  });
  return { entries, wrapped: wrapped as Record<string, (...a: unknown[]) => Promise<unknown>> };
};

describe('wrapActivitiesWithJournal', () => {
  it('journals ai with model/usage, allowlisted args only', async () => {
    const { entries, wrapped } = setup({
      aiText: async () => ({ text: 'answer', usage: { totalTokens: 9 }, model: 'gpt-x' }),
    });
    const out = await journalNodeStorage.run({ documentId: 'd', nodeId: 'n' }, () =>
      wrapped.aiText('SECRET-CRED', 'gpt-x', 'hello'),
    );
    expect(out).toEqual({ text: 'answer', usage: { totalTokens: 9 }, model: 'gpt-x' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'ai',
      level: 'info',
      vendor: 'openai',
      documentId: 'd',
      nodeId: 'n',
      workflowId: 'wf',
      runId: 'run1',
      sourceKey: 'run1:a:5:2',
      message: 'openai: aiText (gpt-x)',
      data: {
        args: { model: 'gpt-x', prompt: 'hello' },
        result: 'answer',
        model: 'gpt-x',
        usage: { totalTokens: 9 },
        attempt: 2,
      },
    });
    expect(JSON.stringify(entries)).not.toContain('SECRET-CRED');
  });

  it('journals a choice result ({ action, data, usage, model }): usage/model lifted out of the result', async () => {
    const { entries, wrapped } = setup({
      aiText: async () => ({ action: 'yes', data: 1, usage: { totalTokens: 4 }, model: 'gpt-y' }),
    });
    await wrapped.aiText('CRED', 'gpt-x', 'pick');
    expect(entries[0]?.data).toMatchObject({
      result: { action: 'yes', data: 1 },
      model: 'gpt-y',
      usage: { totalTokens: 4 },
    });
  });

  it('message-out uses the text as the message and never leaks other args', async () => {
    const { entries, wrapped } = setup({ tgSend: async () => ({ ok: true }) });
    await wrapped.tgSend('CRED', 42, 'Hello there', { Authorization: 'Bearer X' });
    expect(entries[0].message).toBe('Hello there');
    expect(entries[0].data).toMatchObject({ args: { chatId: 42, text: 'Hello there' } });
    expect(JSON.stringify(entries)).not.toContain('Bearer');
    expect(JSON.stringify(entries)).not.toContain('CRED');
  });

  it('error entries: warn when retryable, error when non-retryable, rethrows unchanged, no args', async () => {
    const retryable = new Error('upstream 502 SECRET');
    const fatal = ApplicationFailure.nonRetryable('bad request', 'BadInput');
    const { entries, wrapped } = setup({
      boom: async () => {
        throw retryable;
      },
      plain: async () => {
        throw fatal;
      },
    });
    await expect(wrapped.boom('SECRET-ARG')).rejects.toBe(retryable);
    await expect(wrapped.plain('SECRET-ARG')).rejects.toBe(fatal);
    expect(entries.map((e) => [e.kind, e.level])).toEqual([
      ['error', 'warn'],
      ['error', 'error'],
    ]);
    expect(entries[0].sourceKey).toBe('run1:a:5:2:err');
    expect(entries[1].data).toMatchObject({ errorType: 'BadInput', attempt: 2 });
    expect(JSON.stringify(entries)).not.toContain('SECRET-ARG');
  });

  it('enqueues a log entry for the legacy logActivity and keeps its result', async () => {
    const { entries, wrapped } = setup({ logActivity: async (m: string) => m });
    expect(await wrapped.logActivity('old message')).toBe('old message');
    expect(entries[0]).toMatchObject({ kind: 'log', level: 'info', message: 'old message', nodeId: null });
  });

  it('does not journal activities without a spec on success, and passes non-functions through', async () => {
    const { entries, wrapped } = setup({ plain: async () => 1, constant: 5 });
    expect(await wrapped.plain()).toBe(1);
    expect(entries).toHaveLength(0);
    expect(wrapped.constant).toBe(5);
  });

  it('never waits for the journal and survives a throwing journal', async () => {
    const hang = new Promise<void>(() => {});
    const { wrapped } = setup(
      { aiText: async () => 'x' },
      {
        buffer: {
          push: () => {
            void hang;
            throw new Error('journal broken');
          },
        },
      },
    );
    await expect(wrapped.aiText('c', 'm', 'p')).resolves.toBe('x');
  });

  it('skips journaling outside an activity context', async () => {
    const { entries, wrapped } = setup({ aiText: async () => 'x' }, { getInfo: () => null });
    await wrapped.aiText('c', 'm', 'p');
    expect(entries).toHaveLength(0);
  });
});
