import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileStatements } from './node-emitters.js';

/** A `log` node's `data` is plain message text, compiled as a template literal — `${expr}` is real interpolation. */
const logStatement = (message: string): string => `await logActivity(\`${message}\`);`;

describe('compileStatements', () => {
  it('compiles create-var into a typed let declaration initialized with the type default', () => {
    const node: INode = {
      id: 'v1',
      name: 'create-var',
      data: { name: 'total', variableType: { type: 'number', numberType: { type: 'any' } } },
    };
    expect(compileStatements([node])).toBe(
      '// icon-start:create-var:v1\nlet total: number = 0;\n// icon-end:create-var:v1',
    );
  });

  it('compiles create-var for an enum type without an initializer (no member values are visible here)', () => {
    const node: INode = {
      id: 'v1',
      name: 'create-var',
      data: { name: 'status', variableType: { type: 'enum', schemeId: 'sch1', iconId: 'ic1' } },
    };
    expect(compileStatements([node])).toBe('// icon-start:create-var:v1\nlet status: any;\n// icon-end:create-var:v1');
  });

  it('compiles action by printing the raw code as a normalized statement', () => {
    const node: INode = { id: 'a1', name: 'action', data: 'total = total + 1' };
    expect(compileStatements([node])).toBe('// icon-start:action:a1\ntotal = total + 1;\n// icon-end:action:a1');
  });

  it('compiles log by wrapping the message in a template literal, preserving interpolation syntax', () => {
    // oxlint-disable-next-line no-template-curly-in-string -- literal message text containing real interpolation syntax
    const node: INode = { id: 'l1', name: 'log', data: 'total = ${total}' };
    // oxlint-disable-next-line no-template-curly-in-string
    expect(compileStatements([node])).toBe(
      `// icon-start:log:l1\n${logStatement('total = ${total}')}\n// icon-end:log:l1`,
    );
  });

  it('escapes real newlines in a log message so indenting the surrounding block cannot inject whitespace into it', () => {
    const then: INode = { id: 'then', name: 'if-child', children: [{ id: 'l1', name: 'log', data: 'a\nb' }] };
    const node: INode = { id: 'if1', name: 'if', data: 'total > 0', children: [then] };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:if:if1',
        'if (total > 0) {',
        '  // icon-start:log:l1',
        '  await logActivity(`a\\nb`);',
        '  // icon-end:log:l1',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });

  it('compiles if/else with both branches present', () => {
    const node: INode = {
      id: 'if1',
      name: 'if',
      data: 'total > 0',
      children: [
        { id: 'then', name: 'if-child', children: [{ id: 'l1', name: 'log', data: 'total' }] },
        { id: 'else', name: 'if-child', children: [{ id: 'l2', name: 'log', data: 'none' }] },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:if:if1',
        'if (total > 0) {',
        '  // icon-start:log:l1',
        '  await logActivity(`total`);',
        '  // icon-end:log:l1',
        '} else {',
        '  // icon-start:log:l2',
        '  await logActivity(`none`);',
        '  // icon-end:log:l2',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });

  it('omits the else block entirely when the else branch is empty', () => {
    const node: INode = {
      id: 'if1',
      name: 'if',
      data: 'total > 0',
      children: [
        { id: 'then', name: 'if-child', children: [{ id: 'l1', name: 'log', data: 'total' }] },
        { id: 'else', name: 'if-child', children: [] },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:if:if1',
        'if (total > 0) {',
        '  // icon-start:log:l1',
        '  await logActivity(`total`);',
        '  // icon-end:log:l1',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });

  it('supports nested if statements', () => {
    const node: INode = {
      id: 'if1',
      name: 'if',
      data: 'a',
      children: [
        {
          id: 'then',
          name: 'if-child',
          children: [
            {
              id: 'if2',
              name: 'if',
              data: 'b',
              children: [
                { id: 'then2', name: 'if-child', children: [{ id: 'l1', name: 'log', data: 'a' }] },
                { id: 'else2', name: 'if-child', children: [] },
              ],
            },
          ],
        },
        { id: 'else', name: 'if-child', children: [] },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:if:if1',
        'if (a) {',
        '  // icon-start:if:if2',
        '  if (b) {',
        '    // icon-start:log:l1',
        '    await logActivity(`a`);',
        '    // icon-end:log:l1',
        '  }',
        '  // icon-end:if:if2',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });

  it('treats the first if-child as "then" by default (no meta, or trueOnRight: false)', () => {
    const node: INode = {
      id: 'if1',
      name: 'if',
      data: 'a',
      children: [
        { id: 'first', name: 'if-child', children: [{ id: 'l1', name: 'log', data: 'first' }] },
        { id: 'second', name: 'if-child', children: [{ id: 'l2', name: 'log', data: 'second' }] },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:if:if1',
        'if (a) {',
        '  // icon-start:log:l1',
        '  await logActivity(`first`);',
        '  // icon-end:log:l1',
        '} else {',
        '  // icon-start:log:l2',
        '  await logActivity(`second`);',
        '  // icon-end:log:l2',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });

  it('treats the second if-child as "then" when meta.trueOnRight is true', () => {
    const node: INode = {
      id: 'if1',
      name: 'if',
      meta: { trueOnRight: true },
      data: 'a',
      children: [
        { id: 'first', name: 'if-child', children: [{ id: 'l1', name: 'log', data: 'first' }] },
        { id: 'second', name: 'if-child', children: [{ id: 'l2', name: 'log', data: 'second' }] },
      ],
    };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:if:if1',
        'if (a) {',
        '  // icon-start:log:l2',
        '  await logActivity(`second`);',
        '  // icon-end:log:l2',
        '} else {',
        '  // icon-start:log:l1',
        '  await logActivity(`first`);',
        '  // icon-end:log:l1',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });

  it('throws a clear error when call-function is compiled without a resolver', () => {
    const node: INode = {
      id: 'c1',
      name: 'call-function',
      data: { schemeId: 'scheme-2', parameters: [], returnVariable: '' },
    };
    expect(() => compileStatements([node])).toThrow(/resolveFunctionName/);
  });

  it('throws for a node kind with no registered emitter', () => {
    const node: INode = { id: 'x', name: 'some-future-node' };
    expect(() => compileStatements([node])).toThrow(/some-future-node/);
  });

  it('joins multiple statements with newlines', () => {
    const nodes: INode[] = [
      { id: 'a1', name: 'action', data: 'a = 1' },
      { id: 'a2', name: 'action', data: 'b = 2' },
    ];
    expect(compileStatements(nodes)).toBe(
      '// icon-start:action:a1\na = 1;\n// icon-end:action:a1\n// icon-start:action:a2\nb = 2;\n// icon-end:action:a2',
    );
  });

  it('returns an empty string for an empty list', () => {
    expect(compileStatements([])).toBe('');
  });
});
