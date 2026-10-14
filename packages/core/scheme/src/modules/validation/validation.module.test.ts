// oxlint-disable max-lines, no-undefined, no-void, no-non-null-assertion, no-array-sort, no-useless-undefined, no-promise-executor-return, consistent-function-scoping
import { resolveService } from '@falang/di';
import { runInAction } from 'mobx';
import { afterEach, assert, describe, it, vi } from 'vitest';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { deleteNode } from '../../actions/delete-node.js';
import { insertNode } from '../../actions/insert-node.js';
import { setData } from '../../actions/set-data.js';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import type { Scheme } from '../../scheme/scheme.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { ValidationQueue, type IValidationJob } from './validation.queue.js';
import type { ValidationStore } from './validation.store.js';
import { TOKEN_VALIDATION_STORE } from './validation.store.token.js';
import { ValidationModule } from './validation.module.js';
import type { INodeValidator, TIssueDraft } from './validation.types.js';

const instantQueue = (concurrency = 1) =>
  new ValidationQueue({ concurrency, schedule: (fn) => void Promise.resolve().then(fn) });

interface IFake extends INodeValidator<{ text: string }> {
  describeCalls: number;
  checkCalls: string[];
}

/** Flags an `action` node whose data is the string "bad". */
const fakeValidator = (
  source = 'fake',
  overrides: { check?: (text: string) => TIssueDraft[] | Promise<TIssueDraft[]>; extra?: (id: string) => unknown } = {},
): IFake => {
  const v: IFake = {
    source,
    describeCalls: 0,
    checkCalls: [],
    describe(node) {
      v.describeCalls += 1;
      if (node.name !== 'action') return null;
      const extra = overrides.extra?.(node.id);
      return { text: `${String(node.data ?? '')}${extra === undefined ? '' : `|${String(extra)}`}` };
    },
    check(input) {
      v.checkCalls.push(input.text);
      if (overrides.check) return overrides.check(input.text);
      return input.text.startsWith('bad') ? [{ message: `bad: ${input.text}`, severity: 'error' }] : [];
    },
  };
  return v;
};

describe('ValidationModule', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let store: ValidationStore;
  // oxlint-disable-next-line init-declarations
  let queue: ValidationQueue;

  const build = (validators: INodeValidator[], q = instantQueue()) => {
    queue = q;
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new ValidationModule({ validators, queue })],
      document: getTestEmptyDoc(),
    });
    store = resolveService(TOKEN_VALIDATION_STORE, scheme.container);
  };

  const bodyId = () => {
    const id = scheme.rootNode?.children[1].id;
    if (!id) throw new Error('no body');
    return id;
  };

  const add = (id: string, data: unknown, index = 0) => {
    const node = scheme.infra.structure.factory('action');
    node.id = id;
    node.data = data;
    runInAction(() => insertNode({ index, node, parentId: bodyId() }, scheme));
  };

  const classesOf = (id: string) =>
    resolveService(TOKEN_CSS_CLASSES, scheme.container).getBlockBodyClassName(id).split(' ');

  afterEach(() => {
    scheme.dispose();
  });

  it('reports issues, marks the block and clears them when fixed', async () => {
    build([fakeValidator()]);
    add('a', 'bad');
    assert.equal(store.isPending, true);
    await queue.idle();
    assert.equal(store.isPending, false);
    assert.equal(store.errorCount, 1);
    assert.equal(store.issuesFor('a')[0].source, 'fake');
    assert.equal(store.issuesFor('a')[0].nodeId, 'a');
    assert.include(classesOf('a'), 'has-error');
    runInAction(() => setData({ id: 'a', data: 'ok' }, scheme));
    await queue.idle();
    assert.equal(store.errorCount, 0);
    assert.notInclude(classesOf('a'), 'has-error');
  });

  it('marks warnings with has-warning', async () => {
    build([fakeValidator('w', { check: () => [{ message: 'hmm', severity: 'warning' }] })]);
    add('a', 'x');
    await queue.idle();
    assert.equal(store.warningCount, 1);
    assert.equal(store.hasWarnings('a'), true);
    assert.equal(store.hasErrors('a'), false);
    assert.include(classesOf('a'), 'has-warning');
  });

  it('re-runs describe only for nodes that read the changed state, and only re-queues a changed input', async () => {
    // `b`'s describe depends on node `a`'s data; `c` on nothing.
    const v = fakeValidator('dep', { extra: (id) => (id === 'b' ? scheme.nodes.getNodeSafe('a')?.data : undefined) });
    build([v]);
    add('a', 'one', 0);
    add('b', 'two', 1);
    add('c', 'three', 2);
    await queue.idle();
    const checksBefore = v.checkCalls.length;
    assert.deepEqual([...v.checkCalls].sort(), ['one', 'three', 'two|one']);

    runInAction(() => setData({ id: 'c', data: 'three2' }, scheme));
    await queue.idle();
    assert.deepEqual(v.checkCalls.slice(checksBefore), ['three2']);

    runInAction(() => setData({ id: 'a', data: 'one2' }, scheme));
    await queue.idle();
    assert.deepEqual(v.checkCalls.slice(checksBefore + 1).sort(), ['one2', 'two|one2']);

    // Same described input again -> nothing queued.
    const count = v.checkCalls.length;
    runInAction(() => setData({ id: 'c', data: 'three2' }, scheme));
    await queue.idle();
    assert.equal(v.checkCalls.length, count);
  });

  it('drops a stale async result', async () => {
    let release: (() => void) | null = null;
    const v = fakeValidator('slow', {
      check: (text) =>
        new Promise((resolve) => {
          if (text === 'bad-slow') {
            release = () => resolve([{ message: 'stale', severity: 'error' }]);
          } else resolve([]);
        }),
    });
    build([v]);
    add('a', 'bad-slow');
    await vi.waitFor(() => assert.isNotNull(release));
    runInAction(() => setData({ id: 'a', data: 'fine' }, scheme));
    release!();
    await queue.idle();
    assert.equal(store.errorCount, 0);
    assert.equal(store.isPending, false);
  });

  it('keeps two sources on one node apart', async () => {
    const a = fakeValidator('one', { check: () => [{ message: 'from one', severity: 'error' }] });
    const b = fakeValidator('two', { check: () => [{ message: 'from two', severity: 'warning' }] });
    build([a, b]);
    add('a', 'x');
    await queue.idle();
    assert.deepEqual(
      store
        .issuesFor('a')
        .map((i) => i.source)
        .sort(),
      ['one', 'two'],
    );
    // The first source going clean leaves the second's issue alone.
    store.setIssues('a', 'one', []);
    assert.deepEqual(
      store.issuesFor('a').map((i) => i.source),
      ['two'],
    );
  });

  it('survives a throwing check', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const v = fakeValidator('boom', {
      check: () => {
        throw new Error('boom');
      },
    });
    build([v]);
    add('a', 'x');
    await queue.idle();
    assert.equal(store.errorCount, 0);
    assert.equal(store.isPending, false);
    assert.isAtLeast(warn.mock.calls.length, 1);
    warn.mockRestore();
  });

  it('clears issues and stops watching a deleted node', async () => {
    const v = fakeValidator();
    build([v]);
    add('a', 'bad');
    await queue.idle();
    assert.equal(store.errorCount, 1);
    runInAction(() => deleteNode({ id: 'a' }, scheme));
    assert.equal(store.errorCount, 0);
    assert.equal(store.issuesFor('a').length, 0);
  });

  it('dispose cancels queued work and removes classes', async () => {
    const v = fakeValidator();
    build([v]);
    add('a', 'bad');
    await queue.idle();
    const css = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    scheme.dispose();
    assert.notInclude(css.getBlockBodyClassName('a').split(' '), 'has-error');
    const calls = v.checkCalls.length;
    // A fresh scheme module would be needed to validate again; the old one must not.
    await queue.idle();
    assert.equal(v.checkCalls.length, calls);
    // dispose again in afterEach must be harmless
    scheme = schemeFactory({ infra: getTestInfrastructure(), modules: [], document: getTestEmptyDoc() });
  });

  it('registers validators contributed through the token', async () => {
    const { TOKEN_NODE_VALIDATORS } = await import('./validation.types.js');
    queue = instantQueue();
    const v = fakeValidator('token');
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [
        {
          register: (s) => s.container.registerInstance(TOKEN_NODE_VALIDATORS, v),
        },
        new ValidationModule({ queue }),
      ],
      document: getTestEmptyDoc(),
    });
    store = resolveService(TOKEN_VALIDATION_STORE, scheme.container);
    add('a', 'bad');
    await queue.idle();
    assert.equal(store.errorCount, 1);
  });
});

describe('ValidationQueue', () => {
  const job = (over: Partial<IValidationJob> & { log: string[]; id: string }): IValidationJob => ({
    schemeKey: 's1',
    nodeId: over.id,
    source: 'x',
    check: () => {
      over.log.push(`${over.schemeKey ?? 's1'}:${over.id}`);
      return [];
    },
    apply: () => undefined,
    ...over,
  });

  it('dedups a queued job by (scheme, node, source)', async () => {
    const q = instantQueue();
    const log: string[] = [];
    const discarded: string[] = [];
    q.enqueue(job({ log, id: 'a', discard: () => discarded.push('old') }));
    q.enqueue(job({ log, id: 'a' }));
    await q.idle();
    assert.deepEqual(log, ['s1:a']);
    assert.deepEqual(discarded, ['old']);
  });

  it('respects concurrency 1', async () => {
    const q = instantQueue(1);
    let inFlight = 0;
    let max = 0;
    const mk = (id: string): IValidationJob => ({
      schemeKey: 's',
      nodeId: id,
      source: 'x',
      check: async () => {
        inFlight += 1;
        max = Math.max(max, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return [];
      },
      apply: () => undefined,
    });
    ['a', 'b', 'c'].forEach((id) => q.enqueue(mk(id)));
    await q.idle();
    assert.equal(max, 1);
  });

  it('runs the priority scheme first', async () => {
    const q = instantQueue();
    const log: string[] = [];
    q.enqueue(job({ log, id: 'a', schemeKey: 's1' }));
    q.enqueue(job({ log, id: 'b', schemeKey: 's2' }));
    q.enqueue(job({ log, id: 'c', schemeKey: 's1' }));
    q.setPriorityScheme('s2');
    await q.idle();
    assert.deepEqual(log, ['s2:b', 's1:a', 's1:c']);
  });

  it('cancelScheme discards queued jobs', async () => {
    const q = instantQueue();
    const log: string[] = [];
    let discarded = 0;
    q.enqueue(job({ log, id: 'a', discard: () => (discarded += 1) }));
    q.cancelScheme('s1');
    await q.idle();
    assert.deepEqual(log, []);
    assert.equal(discarded, 1);
  });
});
