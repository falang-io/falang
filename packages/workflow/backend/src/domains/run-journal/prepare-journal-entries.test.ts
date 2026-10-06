// oxlint-disable no-undefined, no-unsafe-optional-chaining -- tests assert on optional rows and omitted fields.
import { describe, expect, it } from 'vitest';
import {
  MAX_DATA_LENGTH,
  MAX_DATA_STRING_LENGTH,
  MAX_MESSAGE_LENGTH,
  prepareJournalEntries,
} from './prepare-journal-entries.js';
import type { IRunJournalEntryInput } from './run-journal.types.js';

const base = { projectId: 'p1', env: 'dev' as const, buildId: 'b1', storeTexts: true };
const entry = (overrides: Partial<IRunJournalEntryInput> = {}): IRunJournalEntryInput => ({
  workflowId: 'wf',
  runId: 'run',
  sourceKey: 'run:w:1',
  kind: 'log',
  level: 'info',
  message: 'hello',
  ts: 1_759_740_000_000,
  ...overrides,
});

describe('prepareJournalEntries', () => {
  it('maps a valid entry and applies defaults', () => {
    const [row] = prepareJournalEntries([entry({ runId: undefined, data: { a: 1 } })], base);
    expect(row).toMatchObject({
      projectId: 'p1',
      env: 'dev',
      buildId: 'b1',
      runId: null,
      documentId: null,
      nodeId: null,
      vendor: null,
      message: 'hello',
      data: { a: 1 },
      truncated: false,
      textsStripped: false,
      sourceKey: 'run:w:1',
    });
    expect(row?.ts.getTime()).toBe(1_759_740_000_000);
  });

  it('drops entries with an unknown kind or level or missing keys', () => {
    expect(
      prepareJournalEntries(
        [entry({ kind: 'nope' }), entry({ level: 'fatal' }), entry({ sourceKey: '' }), entry({ workflowId: '' })],
        base,
      ),
    ).toEqual([]);
  });

  it('caps the message and every string inside data and flags truncated', () => {
    const [row] = prepareJournalEntries(
      [
        entry({
          message: 'm'.repeat(MAX_MESSAGE_LENGTH + 10),
          data: { nested: { text: 'x'.repeat(MAX_DATA_STRING_LENGTH + 5) }, list: ['y'] },
        }),
      ],
      base,
    );
    expect(row?.message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH + 1);
    const text = (row?.data as { nested: { text: string } }).nested.text;
    expect(text.length).toBeLessThanOrEqual(MAX_DATA_STRING_LENGTH + 1);
    expect(row?.truncated).toBe(true);
  });

  it('replaces an oversize data object with a preview', () => {
    const data: Record<string, unknown> = {};
    for (let index = 0; index < 8; index += 1) data[`k${index}`] = 'z'.repeat(MAX_DATA_STRING_LENGTH);
    expect(JSON.stringify(data).length).toBeGreaterThan(MAX_DATA_LENGTH);
    const [row] = prepareJournalEntries([entry({ kind: 'ai', data })], base);
    expect(row?.truncated).toBe(true);
    expect(Object.keys(row?.data ?? {})).toEqual(['truncated', 'preview']);
  });

  describe('text policy off', () => {
    const stripped = { ...base, storeTexts: false };

    it('strips content, keeps metadata, marks the row', () => {
      const [row] = prepareJournalEntries(
        [
          entry({
            kind: 'ai',
            message: 'secret prompt',
            vendor: 'openai',
            nodeId: 'n1',
            data: {
              prompt: 'tell me a secret',
              result: 'the secret is 42',
              model: 'gpt-x',
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, leak: 'text' },
              durationMs: 120,
              attempt: 2,
            },
          }),
        ],
        stripped,
      );
      expect(row?.textsStripped).toBe(true);
      expect(row?.vendor).toBe('openai');
      expect(row?.nodeId).toBe('n1');
      expect(row?.message).not.toContain('secret');
      expect(row?.data).toEqual({
        promptLength: 16,
        resultLength: 16,
        model: 'gpt-x',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        durationMs: 120,
        attempt: 2,
      });
      expect(JSON.stringify(row)).not.toContain('tell me');
    });

    it('never carries trigger payloads, log text or answers', () => {
      const rows = prepareJournalEntries(
        [
          entry({ kind: 'trigger', message: 'Hello bot', data: { payload: { text: 'Hello bot' } }, sourceKey: 'a' }),
          entry({ kind: 'log', message: 'count = 5', sourceKey: 'b' }),
          entry({ kind: 'user-input', message: 'Yes', data: { value: 'Yes', timeout: false }, sourceKey: 'c' }),
        ],
        stripped,
      );
      const json = JSON.stringify(rows);
      expect(json).not.toContain('Hello bot');
      expect(json).not.toContain('count = 5');
      expect(json).not.toContain('"Yes"');
      expect(rows[2]?.data).toEqual({ valueLength: 3, timeout: false });
    });

    it('keeps an error message (cut to 1 KB) and its error text, strips the rest', () => {
      const [row] = prepareJournalEntries(
        [
          entry({
            kind: 'error',
            level: 'error',
            message: 'e'.repeat(MAX_MESSAGE_LENGTH + 50),
            data: {
              error: 'boom',
              errorType: 'ApplicationFailure',
              payload: { text: 'user text' },
              position: [{ documentId: 'd', nodeId: 'n', extra: 'x' }],
            },
          }),
        ],
        stripped,
      );
      expect(row?.message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH + 1);
      expect(row?.truncated).toBe(true);
      expect(row?.data).toEqual({
        error: 'boom',
        errorType: 'ApplicationFailure',
        payloadLength: expect.any(Number),
        position: [{ documentId: 'd', nodeId: 'n' }],
      });
    });
  });
});
