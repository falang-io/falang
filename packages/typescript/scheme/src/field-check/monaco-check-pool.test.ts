// oxlint-disable no-undefined, no-promise-executor-return, no-inline-comments, no-map-spread
import { describe, expect, it, vi } from 'vitest';
import type { ICheckMonaco, ICheckWorkerDiagnostic } from './monaco-check-pool.js';
import { MonacoCheckPool } from './monaco-check-pool.js';

const createFake = (diagnosticsFor: (text: string) => ICheckWorkerDiagnostic[] = () => []) => {
  const models: { uri: string; text: string; disposed: boolean }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const calls: { fileName: string; text: string }[] = [];
  const monaco: ICheckMonaco = {
    Uri: { parse: (value) => value },
    editor: {
      createModel: (value, _language, uri) => {
        const model = { uri: String(uri), text: value, disposed: false };
        models.push(model);
        return {
          setValue: (next: string) => {
            model.text = next;
          },
          dispose: () => {
            model.disposed = true;
          },
        };
      },
    },
    typescript: {
      getTypeScriptWorker: () =>
        Promise.resolve((uri: unknown) => {
          const model = models.find((m) => m.uri === String(uri));
          const run = async (kind: 'syn' | 'sem') => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight -= 1;
            if (kind === 'syn') calls.push({ fileName: String(uri), text: model?.text ?? '' });
            return kind === 'sem' ? diagnosticsFor(model?.text ?? '') : [];
          };
          return Promise.resolve({
            getSyntacticDiagnostics: () => run('syn'),
            getSemanticDiagnostics: () => run('sem'),
          });
        }),
    },
  };
  return { monaco, models, calls, getMaxInFlight: () => maxInFlight };
};

const error = (text: string, needle: string, category = 1): ICheckWorkerDiagnostic => ({
  start: text.indexOf(needle),
  length: needle.length,
  category,
  messageText: `bad ${needle}`,
});

describe('MonacoCheckPool', () => {
  it('reuses one model for sequential checks and serialises concurrent ones with size 1', async () => {
    const fake = createFake();
    const pool = new MonacoCheckPool({ getMonaco: () => fake.monaco, getLibKey: () => 'k', cacheSize: 0 });
    await Promise.all(['a', 'b', 'c'].map((text) => pool.check(text)));
    expect(fake.models).toHaveLength(1);
    expect(fake.models[0].uri).toMatch(/^file:\/\/\/__validation-\d+\.ts$/);
    expect(fake.calls.map((c) => c.text)).toEqual(['a', 'b', 'c']);
    // syntactic + semantic of one check overlap, but two checks never do
    expect(fake.getMaxInFlight()).toBe(2);
  });

  it('size 2 runs two checks at once on two models, never more', async () => {
    const fake = createFake();
    const pool = new MonacoCheckPool({ size: 2, getMonaco: () => fake.monaco, getLibKey: () => 'k', cacheSize: 0 });
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((text) => pool.check(text)));
    expect(fake.models).toHaveLength(2);
    expect(fake.getMaxInFlight()).toBe(4);
    expect(new Set(fake.calls.map((c) => c.fileName)).size).toBe(2);
  });

  it('caches by full text, shares an in-flight check, and keys the cache by lib variant', async () => {
    const fake = createFake();
    let lib = 'full';
    const pool = new MonacoCheckPool({ getMonaco: () => fake.monaco, getLibKey: () => lib });
    await Promise.all([pool.check('same'), pool.check('same')]);
    await pool.check('same');
    expect(fake.calls).toHaveLength(1);
    lib = 'portable';
    await pool.check('same');
    expect(fake.calls).toHaveLength(2);
    await pool.check('same');
    expect(fake.calls).toHaveLength(2);
  });

  it('evicts the least recently used entry', async () => {
    const fake = createFake();
    const pool = new MonacoCheckPool({ getMonaco: () => fake.monaco, getLibKey: () => 'k', cacheSize: 2 });
    await pool.check('a');
    await pool.check('b');
    await pool.check('a'); // refresh a
    await pool.check('c'); // evicts b
    const before = fake.calls.length;
    await pool.check('a');
    expect(fake.calls).toHaveLength(before);
    await pool.check('b');
    expect(fake.calls).toHaveLength(before + 1);
  });

  it('keeps error-category diagnostics only and locates them by line, column and region', async () => {
    const text = 'declare x;\nfoo bar\nexport {};';
    const fake = createFake((t) => [error(t, 'bar'), error(t, 'foo', 0), error(t, 'x', 2)]);
    const pool = new MonacoCheckPool({ getMonaco: () => fake.monaco, getLibKey: () => 'k' });
    const result = await pool.check(text, { prefixLength: 11, valueLength: 7 });
    expect(result).toEqual([{ message: 'bad bar', offset: 15, line: 2, column: 5, region: 'value' }]);
    const hidden = await pool.check(text, { prefixLength: 11, valueLength: 0 });
    expect(hidden[0].region).toBe('suffix');
  });

  it('frees the slot when the worker fails and does not cache the failure', async () => {
    const fake = createFake();
    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    const pool = new MonacoCheckPool({
      getMonaco: () => ({
        ...fake.monaco,
        typescript: { getTypeScriptWorker: () => Promise.reject(new Error('worker down')) },
      }),
      getLibKey: () => 'k',
    });
    await expect(pool.check('a')).rejects.toThrow('worker down');
    await expect(pool.check('a')).rejects.toThrow('worker down');
    expect(failing).not.toHaveBeenCalled();
  });
});
