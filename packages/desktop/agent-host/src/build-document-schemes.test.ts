import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { resolveService } from '@falang/di';
import { registerGlobalTokens, TOKEN_HISTORY } from '@falang/scheme';
import { buildArduinoDocumentScheme } from './arduino/build-arduino-document-scheme.js';
import { createArduinoProjectContainer } from './arduino/create-arduino-project-container.js';
import { buildSketchDocumentScheme } from './sketch/build-sketch-document-scheme.js';
import { buildDefaultSketchDocumentRoot, SKETCH_DOCUMENT_TYPES } from './sketch/document-types.js';
import { createSketchProjectContainer } from './sketch/create-sketch-project-container.js';

const historyOf = (scheme: { container: Parameters<typeof resolveService>[1] }): unknown => {
  try {
    return resolveService(TOKEN_HISTORY, scheme.container);
  } catch {
    return null;
  }
};

describe('buildSketchDocumentScheme', () => {
  it('registers HistoryModule for every document type and defaults the root from the node kind', () => {
    registerGlobalTokens();
    const container = createSketchProjectContainer('logic');
    const fn = buildSketchDocumentScheme({
      doc: { id: 'a', name: 'main', type: 'function' },
      parentContainer: container,
    });
    const structure = buildSketchDocumentScheme({
      doc: { id: 'b', name: 'T', type: 'objects-structure' },
      parentContainer: container,
    });
    try {
      expect(fn.rootNode?.name).toBe('function');
      expect(historyOf(fn)).not.toBeNull();
      expect(structure.rootNode?.name).toBe('objects-structure');
      expect(historyOf(structure)).not.toBeNull();
    } finally {
      fn.dispose();
      structure.dispose();
    }
  });

  it('builds the default root of every document type without a project container', () => {
    registerGlobalTokens();
    for (const type of Object.keys(SKETCH_DOCUMENT_TYPES) as (keyof typeof SKETCH_DOCUMENT_TYPES)[]) {
      expect(buildDefaultSketchDocumentRoot(type).name).toBe(SKETCH_DOCUMENT_TYPES[type].rootNodeName);
    }
  });
});

describe('buildArduinoDocumentScheme', () => {
  it('builds a function scheme with HistoryModule and the Arduino pin node kinds', () => {
    registerGlobalTokens();
    const scheme = buildArduinoDocumentScheme({
      doc: { id: 'setup', name: 'setup' },
      parentContainer: createArduinoProjectContainer(),
    });
    try {
      expect(scheme.rootNode?.name).toBe('function');
      expect(historyOf(scheme)).not.toBeNull();
      expect(() => scheme.infra.structure.getConfig('pin-write-digital')).not.toThrow();
    } finally {
      scheme.dispose();
    }
  });
});
