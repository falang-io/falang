import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileStatements } from './node-emitters.js';
import { NodeCompileError } from './node-compile-error.js';

describe('compileStatements — NodeCompileError attribution', () => {
  it('attributes a top-level node error to that node', () => {
    const node: INode = { id: 'x1', name: 'some-future-node' };

    let thrown: unknown = null;
    try {
      compileStatements([node]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NodeCompileError);
    expect((thrown as NodeCompileError).nodeId).toBe('x1');
  });

  it('attributes an error inside a nested if/foreach body to the innermost offending node, not the wrapping if/foreach', () => {
    const brokenBreak: INode = { id: 'break-1', name: 'break', meta: { outLevel: 5 } };
    const thenChild: INode = { id: 'then-1', name: 'if-child', children: [brokenBreak] };
    const elseChild: INode = { id: 'else-1', name: 'if-child', children: [] };
    const ifNode: INode = { id: 'if-1', name: 'if', data: 'true', children: [thenChild, elseChild] };
    const foreachNode: INode = {
      id: 'foreach-1',
      name: 'foreach',
      data: { arr: 'items', item: 'item', index: '' },
      children: [ifNode],
    };

    let thrown: unknown = null;
    try {
      compileStatements([foreachNode]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NodeCompileError);
    expect((thrown as NodeCompileError).nodeId).toBe('break-1');
  });
});
