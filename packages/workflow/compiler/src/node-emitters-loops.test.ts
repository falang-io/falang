import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileStatements } from './node-emitters.js';

describe('compileStatements: loops, switch, parallel', () => {
  it('compiles foreach with an index into a for-of over .entries()', () => {
    const node: INode = {
      id: 'f1',
      name: 'foreach',
      data: { arr: 'items', item: 'it', index: 'i' },
      children: [{ id: 'l1', name: 'log', data: 'it' }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:foreach:f1',
        'for (const [i, it] of items.entries()) {',
        '  // icon-start:log:l1',
        "  __falangJournal({ kind: 'log', level: 'info', message: `it` });",
        '  // icon-end:log:l1',
        '}',
        '// icon-end:foreach:f1',
      ].join('\n'),
    );
  });

  it('compiles foreach without an index into a plain for-of', () => {
    const node: INode = {
      id: 'f1',
      name: 'foreach',
      data: { arr: 'items', item: 'it', index: '' },
      children: [{ id: 'l1', name: 'log', data: 'it' }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:foreach:f1',
        'for (const it of items) {',
        '  // icon-start:log:l1',
        "  __falangJournal({ kind: 'log', level: 'info', message: `it` });",
        '  // icon-end:log:l1',
        '}',
        '// icon-end:foreach:f1',
      ].join('\n'),
    );
  });

  it('compiles from-to-cycle into an inclusive ascending counting loop', () => {
    const node: INode = {
      id: 'c1',
      name: 'from-to-cycle',
      data: { from: '0', to: '10', item: 'i' },
      children: [{ id: 'l1', name: 'log', data: 'i' }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:from-to-cycle:c1',
        'for (let i = 0; i <= 10; i++) {',
        '  // icon-start:log:l1',
        "  __falangJournal({ kind: 'log', level: 'info', message: `i` });",
        '  // icon-end:log:l1',
        '}',
        '// icon-end:from-to-cycle:c1',
      ].join('\n'),
    );
  });

  it('compiles while into a plain while loop', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'total < 10',
      children: [{ id: 'a1', name: 'action', data: 'total = total + 1' }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:while:w1',
        'while (total < 10) {',
        '  // icon-start:action:a1',
        '  total = total + 1;',
        '  // icon-end:action:a1',
        '}',
        '// icon-end:while:w1',
      ].join('\n'),
    );
  });

  it('compiles while with meta.trueIsMain: true into a negated condition', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'total < 10',
      meta: { trueIsMain: true },
      children: [{ id: 'a1', name: 'action', data: 'total = total + 1' }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:while:w1',
        'while (!(total < 10)) {',
        '  // icon-start:action:a1',
        '  total = total + 1;',
        '  // icon-end:action:a1',
        '}',
        '// icon-end:while:w1',
      ].join('\n'),
    );
  });

  it('compiles while with meta.trueIsMain: false the same as no meta', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'total < 10',
      meta: { trueIsMain: false },
      children: [{ id: 'a1', name: 'action', data: 'total = total + 1' }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:while:w1',
        'while (total < 10) {',
        '  // icon-start:action:a1',
        '  total = total + 1;',
        '  // icon-end:action:a1',
        '}',
        '// icon-end:while:w1',
      ].join('\n'),
    );
  });

  it('compiles pseudo-cycle into while (true) with an unconditional trailing break', () => {
    const node: INode = {
      id: 'p1',
      name: 'pseudo-cycle',
      children: [{ id: 'a1', name: 'action', data: 'total = total + 1' }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:pseudo-cycle:p1',
        'while (true) {',
        '  // icon-start:action:a1',
        '  total = total + 1;',
        '  // icon-end:action:a1',
        '  break;',
        '}',
        '// icon-end:pseudo-cycle:p1',
      ].join('\n'),
    );
  });

  it('compiles an empty pseudo-cycle into while (true) { break; }', () => {
    const node: INode = { id: 'p1', name: 'pseudo-cycle', children: [] };
    expect(compileStatements([node])).toBe(
      ['// icon-start:pseudo-cycle:p1', 'while (true) {', '  break;', '}', '// icon-end:pseudo-cycle:p1'].join('\n'),
    );
  });

  it('compiles switch into cases with an automatic break per option', () => {
    const node: INode = {
      id: 's1',
      name: 'switch',
      data: 'status',
      children: [
        { id: 'o1', name: 'switch-option', data: '"active"', children: [{ id: 'l1', name: 'log', data: '1' }] },
        { id: 'o2', name: 'switch-option', data: '"closed"', children: [] },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:switch:s1',
        'switch (status) {',
        '  case "active": {',
        '    // icon-start:log:l1',
        "    __falangJournal({ kind: 'log', level: 'info', message: `1` });",
        '    // icon-end:log:l1',
        '    break;',
        '  }',
        '  case "closed": {',
        '    break;',
        '  }',
        '}',
        '// icon-end:switch:s1',
      ].join('\n'),
    );
  });

  it('compiles parallel into Promise.all over async IIFEs per thread', () => {
    const node: INode = {
      id: 'p1',
      name: 'parallel',
      children: [
        { id: 't1', name: 'parallel-thread', children: [{ id: 'l1', name: 'log', data: '1' }] },
        { id: 't2', name: 'parallel-thread', children: [] },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:parallel:p1',
        'await Promise.all([',
        '  (async () => {',
        '    // icon-start:log:l1',
        "    __falangJournal({ kind: 'log', level: 'info', message: `1` });",
        '    // icon-end:log:l1',
        '  })(),',
        '  (async () => {})()',
        ']);',
        '// icon-end:parallel:p1',
      ].join('\n'),
    );
  });
});
