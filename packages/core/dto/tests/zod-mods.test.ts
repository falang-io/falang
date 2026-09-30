import { describe, expect, it } from 'vitest';
import * as zod from 'zod';
import { NodesGroup, NodesStack } from '../src';
import { action, cycle, functionCfg, ifCfg, modCfg, switchCfg } from '../src';

const stringType = { type: zod.string(), default: () => '' };

const buildStack = () =>
  new NodesStack([
    new NodesGroup([
      action('action', stringType, { mods: ['timer'] }),
      action('plain', stringType),
      modCfg('timer', stringType),
      modCfg('badge'),
      cycle('while', stringType, { mods: ['timer'] }),
      ...ifCfg('if', stringType, { mods: ['timer', 'badge'] }),
      ...switchCfg({ name: 'switch', data: stringType, optionData: stringType, mods: ['timer'] }),
      ...functionCfg({ name: 'function', data: stringType, footer: stringType, header: stringType }),
    ]),
  ]);

const timer = (id = 't') => ({ id, name: 'timer', data: 'x' });
const doc = (...body: unknown[]) => ({
  id: 'd',
  name: 'doc',
  root: {
    id: 'f',
    name: 'function',
    children: [
      { id: 'h', name: 'function-header', data: '' },
      { id: 'b', name: 'function-body', data: '', children: body },
      { id: 'ft', name: 'function-footer', data: '' },
    ],
  },
});

describe('node mods policy', () => {
  it('derives modKindNames from every config', () => {
    expect([...buildStack().modKindNames].toSorted()).toEqual(['badge', 'timer']);
  });

  it('throws on an unknown mod kind', () => {
    expect(() => new NodesStack([new NodesGroup([action('a', stringType, { mods: ['nope'] })])])).toThrow(/nope/);
  });

  it('accepts a mod on a host that lists it, for every host kind', () => {
    const stack = buildStack();
    const ifNode = {
      id: 'i',
      name: 'if',
      data: '',
      mods: [timer('t2'), { id: 'bd', name: 'badge' }],
      children: [
        { id: 'c1', name: 'if-child', children: [] },
        { id: 'c2', name: 'if-child', children: [] },
      ],
    };
    const sw = {
      id: 's',
      name: 'switch',
      data: '',
      mods: [timer('t3')],
      children: [{ id: 'o', name: 'switch-option', data: '', children: [] }],
    };
    expect(() =>
      stack.parseDocument(
        doc({ id: 'a', name: 'action', data: '', mods: [timer()] }, ifNode, sw, {
          id: 'w',
          name: 'while',
          data: '',
          mods: [timer('t4')],
          children: [],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a mod on a host that does not list it', () => {
    const stack = buildStack();
    expect(() => stack.parseDocument(doc({ id: 'p', name: 'plain', data: '', mods: [timer()] }))).toThrow();
    const fn = doc();
    (fn.root as { mods?: unknown }).mods = [timer()];
    expect(() => stack.parseDocument(fn)).toThrow();
  });

  it('rejects a mod kind the host does not list even if another host does', () => {
    const stack = buildStack();
    expect(() =>
      stack.parseDocument(doc({ id: 'a', name: 'action', data: '', mods: [{ id: 'bd', name: 'badge' }] })),
    ).toThrow();
  });

  it('accepts empty mods on a host without a policy', () => {
    expect(() => buildStack().parseDocument(doc({ id: 'p', name: 'plain', data: '', mods: [] }))).not.toThrow();
  });

  it('rejects a mod-only kind as a child statement', () => {
    const stack = buildStack();
    expect(() => stack.parseDocument(doc(timer()))).toThrow();
  });

  it('rejects two mods of the same kind with a message naming it', () => {
    const stack = buildStack();
    try {
      stack.parseDocument(doc({ id: 'a', name: 'action', data: '', mods: [timer('t1'), timer('t2')] }));
      throw new Error('expected throw');
    } catch (error) {
      const issue = (error as { issues: { message: string; path: unknown[] }[] }).issues[0];
      expect(issue.message).toContain('timer');
      expect(issue.path.slice(-2)).toEqual(['mods', 1]);
    }
  });

  it('rejects children, out and mods on a mod node', () => {
    const stack = buildStack();
    for (const extra of [
      { children: [{ id: 'x', name: 'plain', data: '' }] },
      { out: { id: 'x', name: 'plain', data: '' } },
      { mods: [timer('t9')] },
    ]) {
      expect(() =>
        stack.parseDocument(doc({ id: 'a', name: 'action', data: '', mods: [{ ...timer(), ...extra }] })),
      ).toThrow();
    }
  });

  it('still enforces the first-child-out rule on hosts with mods', () => {
    const stack = buildStack();
    expect(() =>
      stack.parseDocument(
        doc({
          id: 'w',
          name: 'while',
          data: '',
          mods: [timer()],
          children: [{ id: 'a', name: 'plain', data: '', out: { id: 'o', name: 'plain', data: '' } }],
        }),
      ),
    ).toThrow(/first child/);
  });

  it('builders without options produce configs identical to before', () => {
    expect(action('a', stringType)).toEqual({ name: 'a', data: stringType });
    expect(cycle('c', stringType)).not.toHaveProperty('mods');
    expect(ifCfg('i', stringType)[0]).not.toHaveProperty('mods');
  });
});
