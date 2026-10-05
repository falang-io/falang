import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { parseFunctionFile } from './function-file.js';
import { testContext } from './test-utils/context.js';

const ctx = testContext();
const parse = (body: string, signature = 'f(x: number): Promise<number>'): INode =>
  parseFunctionFile(`export async function ${signature} {\n${body}\n}\n`, 'functions/f.ts', 'f', ctx);
const bodyOf = (root: INode): readonly INode[] => root.children?.[1]?.children ?? [];
const strip = (node: INode | undefined): unknown =>
  node && {
    name: node.name,
    data: node.data,
    meta: node.meta,
    children: node.children?.map(strip),
    out: strip(node.out),
  };

describe('G4: rules the tree enforces are normalised, not rejected', () => {
  it('a then-branch ending in a jump moves to the right slot (ADR 0035), with trueOnRight', () => {
    const [ifNode] = bodyOf(
      parse('  if (x > 1) {\n    log(`big`);\n    return 1;\n  } else {\n    log(`small`);\n  }\n  return 0;'),
    );
    expect(strip(ifNode)).toMatchObject({
      children: [
        { children: [{ data: 'small', name: 'log' }], name: 'if-child' },
        { children: [{ data: 'big', name: 'log' }], name: 'if-child', out: { data: '1', name: 'return' } },
      ],
      meta: { trueOnRight: true },
      name: 'if',
    });
  });

  it('when both branches jump, the first keeps its jump as a plain last statement', () => {
    const [ifNode] = bodyOf(parse('  if (x > 1) {\n    return 1;\n  } else {\n    return 2;\n  }'));
    expect(ifNode?.children?.[0]?.out).toBeUndefined();
    expect(ifNode?.children?.[0]?.children?.at(-1)?.name).toBe('return');
    expect(ifNode?.children?.[1]?.out?.name).toBe('return');
  });

  it('a jump ending the first statement-container of a list stays a plain statement; later ones become outs', () => {
    const [first, second] = bodyOf(
      parse('  while (x > 0) {\n    break;\n  }\n  while (x > 1) {\n    break;\n  }\n  return 0;'),
    );
    expect(first?.out).toBeUndefined();
    expect(first?.children?.[0]?.name).toBe('break');
    expect(second?.out?.name).toBe('break');
    expect(second?.children).toEqual([]);
  });

  it('template fields are template literals: escapes and real newlines round-trip into the field body', () => {
    const [log] = bodyOf(parse('  log(`a ${x} \\` and \\\\ and\nsecond line`);', 'f(x: number): Promise<void>'));
    expect(log?.data).toBe('a ${x} ` and \\ and\nsecond line');
  });

  it('a quoted string in a template field keeps ${…} as an interpolation (the field body semantics)', () => {
    const [log] = bodyOf(parse("  log('count ${x}');", 'f(x: number): Promise<void>'));
    expect(log?.data).toBe('count ${x}');
  });

  it('multi-level break gets outLevel from the label', () => {
    const [outer] = bodyOf(
      parse('  L1: while (x > 0) {\n    while (x > 1) {\n      break L1;\n    }\n  }', 'f(x: number): Promise<void>'),
    );
    const inner = outer?.children?.[0];
    expect(inner?.children?.[0]).toMatchObject({ meta: { outLevel: 2 }, name: 'break' });
  });

  it('`while (true) { …; break; }` is the run-once block', () => {
    const [block] = bodyOf(parse('  while (true) {\n    log(`once`);\n    break;\n  }', 'f(): Promise<void>'));
    expect(strip(block)).toMatchObject({ children: [{ name: 'log' }], name: 'pseudo-cycle' });
  });
});
