// oxlint-disable no-explicit-any, no-void, no-undefined, no-useless-undefined, no-promise-executor-return, no-inline-comments, no-nested-ternary
import { container as rootContainer, resolveService } from '@falang/di';
import { NodesStack } from '@falang/dto';
import {
  CMD_INSERT_NODE,
  CMD_SET_DATA,
  registerGlobalTokens,
  TOKEN_VALIDATION_STORE,
  ValidationModule,
  ValidationQueue,
  type Scheme,
} from '@falang/scheme';
import { functionNodesGroup } from '@falang/typescript-dto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { functionalSchemeFactory } from '../functional.js';
import { registerTypescriptProjectService } from '../typescript-project-service/register-typescript-project-service.js';
import type { MonacoCheckPool } from './monaco-check-pool.js';
import { createTypescriptFieldsValidator, HIDDEN_LINE_NOTE } from './ts-fields-validator.js';

/** A pool that "finds" an error whenever the text mentions `undeclared`, as a value or as a hidden-line problem. */
const fakePool = (available = true) => {
  const checked: string[] = [];
  const pool = {
    isAvailable: () => available,
    check: (text: string, regions?: { prefixLength: number; valueLength: number }) => {
      checked.push(text);
      const offset = text.indexOf('undeclared');
      if (offset === -1) return Promise.resolve([]);
      const region = regions ? (offset < regions.prefixLength ? 'prefix' : 'value') : undefined;
      return Promise.resolve([{ message: 'Cannot find name', offset, line: 1, column: 1, region }]);
    },
  };
  return { pool: pool as unknown as MonacoCheckPool, checked };
};

const build = (pool: MonacoCheckPool) => {
  registerGlobalTokens();
  const container = rootContainer.createChildContainer();
  registerTypescriptProjectService(container);
  const queue = new ValidationQueue({ schedule: (fn) => void Promise.resolve().then(fn) });
  const scheme: Scheme = functionalSchemeFactory({
    parentContainer: container,
    extraModules: [new ValidationModule({ validators: [createTypescriptFieldsValidator({ pool }) as any], queue })],
    document: {
      id: 'd',
      type: 'function',
      name: 'doc',
      root: new NodesStack([functionNodesGroup]).factory('function'),
    },
  });
  const body = scheme.rootNode?.children[1];
  if (!body) throw new Error('no body');
  const add = (id: string, name: string, data: unknown, index: number) => {
    const node = scheme.infra.structure.factory(name);
    Object.assign(node, { id, data });
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index, parentId: body.id, node });
  };
  return { scheme, queue, add, store: resolveService(TOKEN_VALIDATION_STORE, scheme.container) };
};

describe('TypeScript fields validator', () => {
  let scheme: Scheme | null = null;
  afterEach(() => scheme?.dispose());

  it('reports code and identifier problems with the field', async () => {
    const { pool } = fakePool();
    const t = build(pool);
    scheme = t.scheme;
    t.add('a', 'action', 'undeclared = 1', 0);
    t.add('p', 'arr-pop', { arr: 'x', variable: 'class' }, 1);
    await t.queue.idle();
    expect(t.store.issuesFor('a')).toMatchObject([{ field: 'value', severity: 'error', source: 'typescript' }]);
    expect(t.store.issuesFor('a')[0].message).not.toContain(HIDDEN_LINE_NOTE);
    const pop = t.store.issuesFor('p');
    expect(pop.find((i) => i.field === 'variable')?.message).toContain('зарезервированное слово');
  });

  it('marks an error on a hidden line as concerning the field type or scope', async () => {
    const { pool } = fakePool();
    const t = build(pool);
    scheme = t.scheme;
    t.add('v', 'create-var', { name: 'undeclared', variableType: { type: 'number', numberType: { type: 'any' } } }, 0);
    t.add('a', 'action', '1', 1);
    await t.queue.idle();
    // the scope declare of `undeclared` is in the hidden prefix of the action below
    expect(t.store.issuesFor('a')[0].message).toContain(HIDDEN_LINE_NOTE);
  });

  it('skips allowEmpty fields when empty (create-var value)', async () => {
    const { pool, checked } = fakePool();
    const t = build(pool);
    scheme = t.scheme;
    t.add('v', 'create-var', { name: 'x', variableType: { type: 'number', numberType: { type: 'any' } } }, 0);
    await t.queue.idle();
    expect(checked).toEqual([]);
    expect(t.store.errorCount).toBe(0);
  });

  it('re-checks the nodes below a renamed variable, not the ones above', async () => {
    const { pool, checked } = fakePool();
    const t = build(pool);
    scheme = t.scheme;
    t.add('above', 'action', 'above = 1', 0);
    t.add('v', 'create-var', { name: 'x', variableType: { type: 'number', numberType: { type: 'any' } } }, 1);
    t.add('below', 'action', 'x = 2', 2);
    await t.queue.idle();
    checked.length = 0;
    const data = t.scheme.nodes.getNode('v').data as any;
    t.scheme.commands.dispatchCommand(CMD_SET_DATA, { id: 'v', data: { ...data, name: 'renamed' } });
    await t.queue.idle();
    expect(checked.some((text) => text.includes('x = 2') && text.includes('declare var renamed'))).toBe(true);
    expect(checked.some((text) => text.includes('above = 1'))).toBe(false);
  });

  it('degrades to nothing when Monaco is not available, keeping identifier checks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { pool, checked } = fakePool(false);
    const t = build(pool);
    scheme = t.scheme;
    t.add('a', 'action', 'undeclared = 1', 0);
    t.add('p', 'arr-pop', { arr: 'x', variable: '' }, 1);
    await t.queue.idle();
    expect(checked).toEqual([]);
    expect(t.store.issuesFor('a')).toEqual([]);
    expect(t.store.issuesFor('p').map((i) => i.field)).toEqual(['variable']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
