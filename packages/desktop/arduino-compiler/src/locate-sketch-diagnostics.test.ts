import { describe, expect, it, vi } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { compileArduinoProject } from './compile-arduino-project.js';
import { locateSketchDiagnostics } from './locate-sketch-diagnostics.js';

const functionNode = (id: string, body: INode[]): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: body },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const functionDocument = (id: string, name: string, body: INode[]): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root: functionNode(id, body),
});

const devicesDocument: IProjectDocument = {
  id: 'doc-devices',
  type: 'devices',
  name: 'Devices',
  data: { pins: [{ id: 'p1', pin: 13, mode: 'output' }], devices: [] },
};

// Real ts.Program type-check per document; the default timeout flakes under a full parallel run.
vi.setConfig({ testTimeout: 20_000 });

/** 1-based line of the first line of `code` containing `needle`. */
const lineOf = (code: string, needle: string): number =>
  code.split('\n').findIndex((line) => line.includes(needle)) + 1;

const error = (file: string, line: number) => ({ file, line, column: 3, severity: 'error' as const, message: 'boom' });

describe('locateSketchDiagnostics', () => {
  const { code } = compileArduinoProject({
    documents: [
      functionDocument('doc-setup', 'setup', [{ id: 'n-delay', name: 'delay', data: { value: '10' } }]),
      functionDocument('doc-loop', 'loop', [
        { id: 'n-write', name: 'pin-write-digital', data: { pin: 7, value: true } },
        { id: 'n-action', name: 'action', data: 'delay(1000)' },
      ]),
      devicesDocument,
    ],
  });

  it('attributes a sketch line to the document and the node (lowered pin/function nodes keep their ids)', () => {
    const located = locateSketchDiagnostics(
      [
        error('sketch.ino', lineOf(code, 'digitalWrite(7, HIGH);')),
        error('sketch.ino', lineOf(code, 'delay(1000);')),
        error('sketch.ino', lineOf(code, 'delay(10);')),
      ],
      'sketch.ino',
      code,
    );
    expect(located.map(({ documentId, documentName, nodeId }) => ({ documentId, documentName, nodeId }))).toEqual([
      { documentId: 'doc-loop', documentName: 'loop', nodeId: 'n-write' },
      { documentId: 'doc-loop', documentName: 'loop', nodeId: 'n-action' },
      { documentId: 'doc-setup', documentName: 'setup', nodeId: 'n-delay' },
    ]);
  });

  it('attributes a pin/device line of setup() to the Devices document', () => {
    const [located] = locateSketchDiagnostics(
      [error('sketch.ino', lineOf(code, 'pinMode(13, OUTPUT);'))],
      'sketch.ino',
      code,
    );
    expect(located).toMatchObject({ documentId: 'doc-devices', documentName: 'Devices' });
    expect(located.nodeId).toBeUndefined();
  });

  it('leaves other files and lines outside every marker unattributed', () => {
    const located = locateSketchDiagnostics(
      [error('drv.cpp', 3), error('sketch.ino', lineOf(code, '#include <Arduino.h>'))],
      'sketch.ino',
      code,
    );
    expect(located).toEqual([error('drv.cpp', 3), error('sketch.ino', 1)]);
  });
});
