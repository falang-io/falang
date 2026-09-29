import type { INode, IProjectDocument } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { ProjectCompileError } from './compile-errors.js';
import { compileProject } from './compile-project.js';

const functionNode = (id: string, bodyChildren: INode[] = []): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: bodyChildren },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const functionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root,
});

describe('compileProject — partial output on ProjectCompileError', () => {
  it('carries the partial workflows/activities of whatever DID compile, alongside the errors', () => {
    const broken = functionNode('doc-broken', [
      { id: 'c1', name: 'call-function', data: { schemeId: 'missing', parameters: [], returnVariable: '' } },
    ]);
    const good = functionNode('doc-good', [{ id: 'l1', name: 'log', data: 'hi' }]);

    let thrown: unknown = null;
    try {
      compileProject({
        documents: [functionDocument('doc-broken', 'broken', broken), functionDocument('doc-good', 'good', good)],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ProjectCompileError);
    const error = thrown as ProjectCompileError;
    expect(error.workflows).toContain('export async function good(): Promise<void> {');
    expect(error.workflows).not.toContain('broken');
    expect(error.activities).toContain('export const logActivity');
  });
});
