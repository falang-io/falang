import type { INode } from '@falang/dto';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileStatements } from './node-emitters.js';

const switchNode: INode = {
  children: [
    { children: [{ data: 'x = 1', id: 'a1', name: 'action' }], data: '"one"', id: 'o1', name: 'switch-option' },
    { children: [{ data: 'x = 2', id: 'a2', name: 'action' }], data: ' default ', id: 'o2', name: 'switch-option' },
  ],
  data: 'status',
  id: 's1',
  name: 'switch',
};

describe('switch-option `default`', () => {
  it('compiles to the default: branch, not `case default:`', () => {
    const code = compileStatements([switchNode]);
    expect(code).toContain('default: {');
    expect(code).not.toContain('case default');
    expect(code).toContain('case "one": {');
  });

  it('is valid TypeScript syntax', () => {
    const code = `declare let status: string; declare let x: number;\n${compileStatements([switchNode])}`;
    const out = ts.transpileModule(code, { reportDiagnostics: true });
    expect(out.diagnostics ?? []).toEqual([]);
  });
});
