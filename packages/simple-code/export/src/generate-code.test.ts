import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { generateCode } from './generate-code.js';

const node = (partial: Partial<INode> & { id: string; name: string }): INode => partial as INode;

describe('generateCode (cpp)', () => {
  it('emits function header/body/footer, if/else with an out-node, and while with an out-node', () => {
    const root = node({
      id: 'root',
      name: 'code-function',
      children: [
        node({ id: 'h1', name: 'code-function-header', data: 'int main()' }),
        node({
          id: 'b1',
          name: 'code-function-body',
          data: '',
          children: [
            node({
              id: 'if1',
              name: 'if',
              data: 'x > 0',
              children: [
                node({
                  id: 'ic0',
                  name: 'if-child',
                  children: [node({ id: 'a1', name: 'action', data: String.raw`printf("yes\n");` })],
                }),
                node({
                  id: 'ic1',
                  name: 'if-child',
                  children: [],
                  out: node({ id: 'c1', name: 'continue' }),
                }),
              ],
            }),
            node({
              id: 'w1',
              name: 'while',
              data: 'i < 10',
              children: [node({ id: 'a2', name: 'action', data: 'i++;' })],
              out: node({ id: 'br1', name: 'break' }),
            }),
          ],
        }),
        node({ id: 'f1', name: 'code-function-footer', data: 'return 0;' }),
      ],
    });

    expect(generateCode(root, 'cpp')).toBe(
      [
        'int main()',
        '{',
        '  if (x > 0) {',
        String.raw`    printf("yes\n");`,
        '  } else {',
        '    continue;',
        '  }',
        '  while (i < 10) {',
        '    i++;',
        '    break;',
        '  }',
        '  return 0;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('flips if branches when meta.trueOnRight is true', () => {
    const buildIf = (meta?: { trueOnRight: boolean }) =>
      node({
        id: 'root',
        name: 'code-function',
        children: [
          node({ id: 'h1', name: 'code-function-header', data: 'void f()' }),
          node({
            id: 'b1',
            name: 'code-function-body',
            children: [
              node({
                id: 'if1',
                name: 'if',
                data: 'cond',
                ...(meta ? { meta } : {}),
                children: [
                  node({
                    id: 'ic0',
                    name: 'if-child',
                    children: [node({ id: 'a0', name: 'action', data: 'first();' })],
                  }),
                  node({
                    id: 'ic1',
                    name: 'if-child',
                    children: [node({ id: 'a1', name: 'action', data: 'second();' })],
                  }),
                ],
              }),
            ],
          }),
          node({ id: 'f1', name: 'code-function-footer', data: '' }),
        ],
      });

    const defaultOutput = generateCode(buildIf(), 'cpp');
    expect(defaultOutput).toContain('  if (cond) {\n    first();\n  } else {\n    second();\n  }');

    const flipped = generateCode(buildIf({ trueOnRight: true }), 'cpp');
    expect(flipped).toContain('  if (cond) {\n    second();\n  } else {\n    first();\n  }');
  });

  it('negates the while condition when meta.trueIsMain is true, leaves it as-is when false or absent', () => {
    const buildWhile = (meta?: { trueIsMain: boolean }) =>
      node({
        id: 'root',
        name: 'code-function',
        children: [
          node({ id: 'h1', name: 'code-function-header', data: 'void f()' }),
          node({
            id: 'b1',
            name: 'code-function-body',
            children: [
              node({
                id: 'w1',
                name: 'while',
                data: 'i < 10',
                ...(meta ? { meta } : {}),
                children: [node({ id: 'a1', name: 'action', data: 'i++;' })],
              }),
            ],
          }),
          node({ id: 'f1', name: 'code-function-footer', data: '' }),
        ],
      });

    expect(generateCode(buildWhile(), 'cpp')).toContain('  while (i < 10) {');
    expect(generateCode(buildWhile({ trueIsMain: false }), 'cpp')).toContain('  while (i < 10) {');
    expect(generateCode(buildWhile({ trueIsMain: true }), 'cpp')).toContain('  while (!(i < 10)) {');
  });

  it('re-indents multi-line raw data line by line', () => {
    const root = node({
      id: 'root',
      name: 'code-function',
      children: [
        node({ id: 'h1', name: 'code-function-header', data: 'void f()' }),
        node({
          id: 'b1',
          name: 'code-function-body',
          children: [
            node({
              id: 'w1',
              name: 'while',
              data: 'true',
              children: [node({ id: 'a1', name: 'action', data: 'line1();\nline2();' })],
            }),
          ],
        }),
        node({ id: 'f1', name: 'code-function-footer', data: '' }),
      ],
    });

    expect(generateCode(root, 'cpp')).toContain('  while (true) {\n    line1();\n    line2();\n  }');
  });

  it('falls back to a comment for an unknown node name instead of throwing', () => {
    const root = node({ id: 'root', name: 'mystery-node', data: 'x' });
    expect(generateCode(root, 'cpp')).toBe('// !!! no generator for node "mystery-node" (root)\n');
  });

  it('detects the "default" switch-option case', () => {
    const root = node({
      id: 'root',
      name: 'code-function',
      children: [
        node({ id: 'h1', name: 'code-function-header', data: 'void f()' }),
        node({
          id: 'b1',
          name: 'code-function-body',
          children: [
            node({
              id: 's1',
              name: 'switch',
              data: 'x',
              children: [
                node({
                  id: 'o1',
                  name: 'switch-option',
                  data: '1',
                  children: [node({ id: 'a1', name: 'action', data: 'one();' })],
                }),
                node({
                  id: 'o2',
                  name: 'switch-option',
                  data: 'default',
                  children: [node({ id: 'a2', name: 'action', data: 'other();' })],
                }),
              ],
            }),
          ],
        }),
        node({ id: 'f1', name: 'code-function-footer', data: '' }),
      ],
    });

    const output = generateCode(root, 'cpp');
    expect(output).toContain('case 1: {\n      one();\n    }');
    expect(output).toContain('default: {\n      other();\n    }');
  });
});

describe('generateCode (rust)', () => {
  it('emits match instead of switch, loop instead of while(true), and panic! for throw', () => {
    const root = node({
      id: 'root',
      name: 'code-function',
      children: [
        node({ id: 'h1', name: 'code-function-header', data: 'fn f()' }),
        node({
          id: 'b1',
          name: 'code-function-body',
          children: [
            node({
              id: 's1',
              name: 'switch',
              data: 'x',
              children: [
                node({ id: 'o1', name: 'switch-option', data: '1', children: [] }),
                node({ id: 'o2', name: 'switch-option', data: 'default', children: [] }),
              ],
            }),
            node({ id: 'p1', name: 'pseudo-cycle', children: [] }),
            node({ id: 't1', name: 'throw', data: 'MyError' }),
          ],
        }),
        node({ id: 'f1', name: 'code-function-footer', data: '' }),
      ],
    });

    const output = generateCode(root, 'rust');
    expect(output).toContain('match x {');
    expect(output).toContain('1 => {');
    expect(output).toContain('_ => {');
    expect(output).toContain('loop {');
    expect(output).toContain('panic!(MyError);');
  });

  it('negates the while condition when meta.trueIsMain is true, with no parens around it (Rust never parenthesizes)', () => {
    const root = node({
      id: 'root',
      name: 'code-function',
      children: [
        node({ id: 'h1', name: 'code-function-header', data: 'fn f()' }),
        node({
          id: 'b1',
          name: 'code-function-body',
          children: [
            node({
              id: 'w1',
              name: 'while',
              data: 'i < 10',
              meta: { trueIsMain: true },
              children: [node({ id: 'a1', name: 'action', data: 'i += 1;' })],
            }),
          ],
        }),
        node({ id: 'f1', name: 'code-function-footer', data: '' }),
      ],
    });

    expect(generateCode(root, 'rust')).toContain('while !(i < 10) {');
  });
});

describe('generateCode (php)', () => {
  it('wraps output in <?php / ?>', () => {
    const root = node({ id: 'root', name: 'action', data: 'echo 1;' });
    const output = generateCode(root, 'php');
    expect(output.startsWith('<?php\n')).toBe(true);
    expect(output.endsWith('?>\n')).toBe(true);
  });
});
