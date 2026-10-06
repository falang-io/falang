import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import type { IDebugEmitOptions, IDebugTraceSite } from './node-emitters.js';
import { compileStatements } from './node-emitters.js';
import { throwUnresolvedCallFunction } from './resolve-function-name.js';

const log = (id: string, data: string): INode => ({ id, name: 'log', data });
const magic = (children: INode[], out?: INode): INode => ({
  id: 'm1',
  name: 'magic',
  data: { spell: 'do things' },
  children,
  ...(out ? { out } : {}),
});

const debugOptions = (): IDebugEmitOptions & { sites: IDebugTraceSite[] } => {
  const sites: IDebugTraceSite[] = [];
  let next = 0;
  return {
    documentId: 'doc-1',
    allocateIndex: () => {
      next += 1;
      return next - 1;
    },
    onTracePoint: (site) => sites.push(site),
    sites,
  };
};

describe('compileStatements — magic node (ADR 0046 (private))', () => {
  it('inlines children with no braces, wrapped only in its own markers', () => {
    expect(compileStatements([magic([log('l1', 'a'), log('l2', 'b')])])).toBe(
      [
        '// icon-start:magic:m1',
        '// icon-start:log:l1',
        "__falangJournal({ kind: 'log', level: 'info', message: `a` });",
        '// icon-end:log:l1',
        '// icon-start:log:l2',
        "__falangJournal({ kind: 'log', level: 'info', message: `b` });",
        '// icon-end:log:l2',
        '// icon-end:magic:m1',
      ].join('\n'),
    );
  });

  it('an empty magic node emits nothing', () => {
    expect(compileStatements([magic([])])).toBe('');
  });

  it("appends the container's own out after the children", () => {
    const code = compileStatements([magic([log('l1', 'a')], { id: 'r1', name: 'return', data: '' })]);
    expect(code.indexOf('__falangJournal')).toBeLessThan(code.indexOf('return'));
    expect(code).toContain('icon-start:return:r1');
  });

  it('with position tracking and debug on, the magic node and each child get markers', () => {
    const debug = debugOptions();
    const code = compileStatements([magic([log('l1', 'a')])], throwUnresolvedCallFunction, {}, {}, true, debug);
    expect(code).toContain('__falangAt("m1");');
    expect(code).toContain('__falangAt("l1");');
    expect(debug.sites.map((s) => s.nodeId).toSorted()).toEqual(['l1', 'm1']);
  });

  it('a create-var inside a magic node is in debug scope for later siblings after it', () => {
    const debug = debugOptions();
    const createVar: INode = {
      id: 'v1',
      name: 'create-var',
      data: { name: 'total', variableType: { type: 'number', numberType: { type: 'any' } } },
    };
    compileStatements([magic([createVar]), log('l9', 'total')], throwUnresolvedCallFunction, {}, {}, false, debug);
    const after = debug.sites.find((s) => s.nodeId === 'l9');
    expect(after?.variables.map((v) => v.name)).toEqual(['total']);
  });
});
