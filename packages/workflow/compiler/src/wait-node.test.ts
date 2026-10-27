import type { INode, IProjectDocument } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';

const functionDocument = (body: INode[]): IProjectDocument => ({
  id: 'doc-1',
  type: 'function',
  name: 'run',
  root: {
    id: 'doc-1',
    name: 'function',
    children: [
      { id: 'doc-1-header', name: 'function-header', data: '' },
      { id: 'doc-1-body', name: 'function-body', data: { parameters: [] }, children: body },
      { id: 'doc-1-footer', name: 'function-footer', data: '' },
    ],
  },
});

describe('wait node', () => {
  it('compiles to a durable sleep, clamping a negative number to 0', () => {
    const compiled = compileProject({
      documents: [functionDocument([{ id: 'w1', name: 'wait', data: "'1 day'" }])],
    });
    expect(compiled.workflows).toMatch(/import \{[^}]*\bsleep\b[^}]*\} from '@temporalio\/workflow';/);
    expect(compiled.workflows).toContain(
      "{ const __falangWait = ('1 day'); await sleep(typeof __falangWait === 'number' ? Math.max(0, __falangWait) : __falangWait); }",
    );
  });

  it('imports sleep only when a wait node exists', () => {
    const compiled = compileProject({
      documents: [functionDocument([{ id: 'a1', name: 'action', data: 'const x = 1' }])],
    });
    expect(compiled.workflows).not.toMatch(/\bsleep\b/);
  });
});
