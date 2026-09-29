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

describe('compileProject — error collection and node attribution', () => {
  it('collects one error per broken document instead of stopping at the first, attributing each to its offending node where known', () => {
    const brokenCaller = functionNode('doc-caller', [
      { id: 'c1', name: 'call-function', data: { schemeId: 'missing', parameters: [], returnVariable: '' } },
    ]);

    let thrown: unknown = null;
    try {
      compileProject({
        documents: [
          functionDocument('doc-caller', 'caller', brokenCaller),
          { id: 'doc-empty', type: 'function', name: 'empty' },
        ],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ProjectCompileError);
    const error = thrown as ProjectCompileError;
    expect(error.errors).toEqual([
      // `nodeId: 'c1'` — attributed to the call-function node itself, not just its document.
      { documentId: 'doc-caller', documentName: 'caller', nodeId: 'c1', message: expect.stringMatching(/missing/) },
      // No specific node exists here (the document has no root at all), so no `nodeId` key at all.
      { documentId: 'doc-empty', documentName: 'empty', message: expect.stringMatching(/root/) },
    ]);
  });
});
