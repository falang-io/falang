import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileStatements } from './node-emitters.js';

describe('compileStatements — marker wrapping', () => {
  it('wraps a statement in icon-start/icon-end markers', () => {
    const node: INode = { id: 'l1', name: 'log', data: 'hi' };
    expect(compileStatements([node])).toBe(
      ['// icon-start:log:l1', 'await logActivity(`hi`);', '// icon-end:log:l1'].join('\n'),
    );
  });

  it('nests markers for a node inside a recursive block, innermost first', () => {
    const log: INode = { id: 'l1', name: 'log', data: 'x' };
    const thenChild: INode = { id: 'then', name: 'if-child', children: [log] };
    const elseChild: INode = { id: 'else', name: 'if-child', children: [] };
    const ifNode: INode = { id: 'if1', name: 'if', data: 'true', children: [thenChild, elseChild] };

    expect(compileStatements([ifNode])).toBe(
      [
        '// icon-start:if:if1',
        'if (true) {',
        '  // icon-start:log:l1',
        '  await logActivity(`x`);',
        '  // icon-end:log:l1',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });
});
