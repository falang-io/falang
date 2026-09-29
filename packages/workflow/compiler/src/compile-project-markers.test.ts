import type { INode, IProjectDocument } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';
import { parseCompiledMarkers, resolveMarkerLocation } from './parse-compiled-markers.js';

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

describe('compileProject — marker wrapping', () => {
  it('wraps each document and node in markers that resolve every line back to the right document/node', () => {
    const caller = functionNode('doc-caller', [
      {
        id: 'c1',
        name: 'call-function',
        data: { schemeId: 'doc-callee', parameters: ['"eu"'], returnVariable: 'shippingCost' },
      },
    ]);
    const callee = functionNode('doc-callee', [{ id: 'l1', name: 'log', data: 'calc' }]);

    const result = compileProject({
      documents: [
        functionDocument('doc-caller', 'processOrder', caller),
        functionDocument('doc-callee', 'calculateShipping', callee),
      ],
    });

    const markers = parseCompiledMarkers(result.workflows);
    const lines = result.workflows.split('\n');

    const callFunctionLine = lines.findIndex((line) => line.includes('await calculateShipping'));
    expect(resolveMarkerLocation(markers, callFunctionLine)).toEqual({
      documentId: 'doc-caller',
      documentName: 'processOrder',
      nodeId: 'c1',
    });

    const logLine = lines.findIndex((line) => line.includes('logActivity(`calc`)'));
    expect(resolveMarkerLocation(markers, logLine)).toEqual({
      documentId: 'doc-callee',
      documentName: 'calculateShipping',
      nodeId: 'l1',
    });

    // The preamble (proxyLocalActivities setup) is outside every marker.
    expect(resolveMarkerLocation(markers, 0)).toEqual({});
  });
});
