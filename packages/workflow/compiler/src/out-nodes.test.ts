import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileStatements } from './node-emitters.js';

describe('compileStatements: break/continue/throw/return', () => {
  it('compiles throw/return by printing the expression', () => {
    expect(compileStatements([{ id: 't1', name: 'throw', data: 'new Error("bad")' }])).toBe(
      '// icon-start:throw:t1\nthrow new Error("bad");\n// icon-end:throw:t1',
    );
    expect(compileStatements([{ id: 'r1', name: 'return', data: 'total' }])).toBe(
      '// icon-start:return:r1\nreturn total;\n// icon-end:return:r1',
    );
  });

  it('leaves a loop with no break/continue inside unlabeled', () => {
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

  it('labels the loop and emits a labeled jump when it contains a break/continue (outLevel defaults to 1)', () => {
    const node: INode = {
      id: 'f1',
      name: 'foreach',
      data: { arr: 'items', item: 'it', index: '' },
      children: [{ id: 'b1', name: 'break' }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:foreach:f1',
        'L1: for (const it of items) {',
        '  // icon-start:break:b1',
        '  break L1;',
        '  // icon-end:break:b1',
        '}',
        '// icon-end:foreach:f1',
      ].join('\n'),
    );
  });

  it('labels the loop and emits a labeled jump when break/continue explicitly target it (outLevel: 1)', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'true',
      children: [{ id: 'c1', name: 'continue', meta: { outLevel: 1 } }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:while:w1',
        'L1: while (true) {',
        '  // icon-start:continue:c1',
        '  continue L1;',
        '  // icon-end:continue:c1',
        '}',
        '// icon-end:while:w1',
      ].join('\n'),
    );
  });

  it('resolves outLevel > 1 to a labeled jump on an outer loop, leaving the inner loop unlabeled', () => {
    const outer: INode = {
      id: 'f1',
      name: 'foreach',
      data: { arr: 'items', item: 'it', index: '' },
      children: [
        {
          id: 'w1',
          name: 'while',
          data: 'true',
          children: [{ id: 'b1', name: 'break', meta: { outLevel: 2 } }],
        },
      ],
    };
    expect(compileStatements([outer])).toBe(
      [
        '// icon-start:foreach:f1',
        'L1: for (const it of items) {',
        '  // icon-start:while:w1',
        '  while (true) {',
        '    // icon-start:break:b1',
        '    break L1;',
        '    // icon-end:break:b1',
        '  }',
        '  // icon-end:while:w1',
        '}',
        '// icon-end:foreach:f1',
      ].join('\n'),
    );
  });

  it('labels a pseudo-cycle when break/continue explicitly target it, still emitting the trailing unconditional break', () => {
    const node: INode = {
      id: 'p1',
      name: 'pseudo-cycle',
      children: [{ id: 'c1', name: 'continue', meta: { outLevel: 1 } }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:pseudo-cycle:p1',
        'L1: while (true) {',
        '  // icon-start:continue:c1',
        '  continue L1;',
        '  // icon-end:continue:c1',
        '  break;',
        '}',
        '// icon-end:pseudo-cycle:p1',
      ].join('\n'),
    );
  });

  it('throws when outLevel targets a loop level that does not exist', () => {
    const node: INode = {
      id: 'f1',
      name: 'foreach',
      data: { arr: 'items', item: 'it', index: '' },
      children: [{ id: 'b1', name: 'break', meta: { outLevel: 2 } }],
    };
    expect(() => compileStatements([node])).toThrow(/loop level/);
  });

  it('compiles a continue set via the `.out` field (as the editor persists it via set-out-node), not just as a children entry', () => {
    const node: INode = {
      id: 'f1',
      name: 'foreach',
      data: { arr: 'items', item: 'it', index: '' },
      children: [{ id: 'l1', name: 'log', data: 'it' }],
      out: { id: 'c1', name: 'continue', meta: { outLevel: 1 } },
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:foreach:f1',
        'L1: for (const it of items) {',
        '  // icon-start:log:l1',
        "  __falangJournal({ kind: 'log', level: 'info', message: `it` });",
        '  // icon-end:log:l1',
        '  // icon-start:continue:c1',
        '  continue L1;',
        '  // icon-end:continue:c1',
        '}',
        '// icon-end:foreach:f1',
      ].join('\n'),
    );
  });

  it('compiles a break set via `.out` on an if-child branch', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'true',
      children: [
        {
          id: 'i1',
          name: 'if',
          data: 'done',
          children: [
            { id: 'ic1', name: 'if-child', children: [], out: { id: 'b1', name: 'break' } },
            { id: 'ic2', name: 'if-child', children: [] },
          ],
        },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:while:w1',
        'L1: while (true) {',
        '  // icon-start:if:i1',
        '  if (done) {',
        '    // icon-start:break:b1',
        '    break L1;',
        '    // icon-end:break:b1',
        '  }',
        '  // icon-end:if:i1',
        '}',
        '// icon-end:while:w1',
      ].join('\n'),
    );
  });

  it('compiles a continue set via `.out` on a switch-option', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'true',
      children: [
        {
          id: 's1',
          name: 'switch',
          data: 'status',
          children: [
            {
              id: 'o1',
              name: 'switch-option',
              data: '"skip"',
              children: [],
              out: { id: 'c1', name: 'continue' },
            },
          ],
        },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:while:w1',
        'L1: while (true) {',
        '  // icon-start:switch:s1',
        '  switch (status) {',
        '    case "skip": {',
        '      // icon-start:continue:c1',
        '      continue L1;',
        '      // icon-end:continue:c1',
        '      break;',
        '    }',
        '  }',
        '  // icon-end:switch:s1',
        '}',
        '// icon-end:while:w1',
      ].join('\n'),
    );
  });

  it('compiles a return set via `.out` on a parallel-thread', () => {
    const node: INode = {
      id: 'p1',
      name: 'parallel',
      children: [{ id: 't1', name: 'parallel-thread', children: [], out: { id: 'r1', name: 'return', data: '1' } }],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:parallel:p1',
        'await Promise.all([',
        '  (async () => {',
        '    // icon-start:return:r1',
        '    return 1;',
        '    // icon-end:return:r1',
        '  })()',
        ']);',
        '// icon-end:parallel:p1',
      ].join('\n'),
    );
  });

  it('uses a labeled break so it targets the loop instead of an intervening switch', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'true',
      children: [
        {
          id: 's1',
          name: 'switch',
          data: 'status',
          children: [{ id: 'o1', name: 'switch-option', data: '"stop"', children: [{ id: 'b1', name: 'break' }] }],
        },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:while:w1',
        'L1: while (true) {',
        '  // icon-start:switch:s1',
        '  switch (status) {',
        '    case "stop": {',
        '      // icon-start:break:b1',
        '      break L1;',
        '      // icon-end:break:b1',
        '      break;',
        '    }',
        '  }',
        '  // icon-end:switch:s1',
        '}',
        '// icon-end:while:w1',
      ].join('\n'),
    );
  });
});
