import { describe, expect, it } from 'vitest';
import { NodesStack, type INode } from '@falang/dto';
import { getTextGroup } from './index.js';

const timer = (): INode => ({ id: 't1', name: 'timer', data: '5 min' });

describe('text group timer mod', () => {
  const stack = new NodesStack([getTextGroup()]);

  it('registers timer as the only mod kind', () => {
    expect([...stack.modKindNames]).toEqual(['timer']);
  });

  it.each(['action', 'link', 'if', 'switch', 'foreach', 'while'])('%s accepts a timer, exactly one', (name) => {
    const host = stack.factory(name);
    expect(() => stack.parseNode({ ...host, mods: [timer()] })).not.toThrow();
    expect(() => stack.parseNode({ ...host, mods: [timer(), { ...timer(), id: 't2' }] })).toThrow();
  });

  it.each(['parallel', 'pseudo-cycle', 'break'])('%s rejects a timer', (name) => {
    const host = stack.factory(name);
    expect(() => stack.parseNode({ ...host, mods: [timer()] })).toThrow();
  });

  it('rejects timer as a statement', () => {
    const fn = stack.factory('function');
    const [header, body, footer] = fn.children ?? [];
    if (!header || !body || !footer) throw new Error('unexpected function shape');
    expect(() => stack.parseNode({ ...fn, children: [header, { ...body, children: [timer()] }, footer] })).toThrow();
  });
});
