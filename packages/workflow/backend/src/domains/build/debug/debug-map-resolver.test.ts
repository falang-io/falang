import type { IDebugMap } from '@falang/debug';
import { describe, expect, it } from 'vitest';
import { resolveIndexToLocation, resolveLocationsToIndices, resolveVariables } from './debug-map-resolver.js';

const MAP: IDebugMap = {
  tracePoints: [
    { index: 0, documentId: 'doc-1', nodeId: 'n1', variables: [{ name: 'total', type: 'number' }] },
    { index: 1, documentId: 'doc-2', nodeId: 'n2', variables: [{ name: 'item', type: 'string' }, { name: 'index', type: 'number' }] },
  ],
};

describe('resolveLocationsToIndices', () => {
  it('resolves known locations to their trace index', () => {
    expect(
      resolveLocationsToIndices(MAP, [
        { documentId: 'doc-2', nodeId: 'n2' },
        { documentId: 'doc-1', nodeId: 'n1' },
      ]),
    ).toEqual([1, 0]);
  });

  it('silently drops a location the map does not know about', () => {
    expect(resolveLocationsToIndices(MAP, [{ documentId: 'doc-1', nodeId: 'unknown' }])).toEqual([]);
  });

  it('never confuses a node id from one document with the same id in another', () => {
    const map: IDebugMap = {
      tracePoints: [
        { index: 0, documentId: 'doc-1', nodeId: 'same-id', variables: [] },
        { index: 1, documentId: 'doc-2', nodeId: 'same-id', variables: [] },
      ],
    };
    expect(resolveLocationsToIndices(map, [{ documentId: 'doc-2', nodeId: 'same-id' }])).toEqual([1]);
  });
});

describe('resolveIndexToLocation', () => {
  it('resolves a known index back to its location', () => {
    expect(resolveIndexToLocation(MAP, 1)).toEqual({ documentId: 'doc-2', nodeId: 'n2' });
  });

  it('is null for a null index', () => {
    expect(resolveIndexToLocation(MAP, null)).toBeNull();
  });

  it('is null for an index the map does not know about (a stale session against a since-rebuilt artifact)', () => {
    expect(resolveIndexToLocation(MAP, 99)).toBeNull();
  });
});

describe('resolveVariables', () => {
  it('combines live values with the map’s compile-time types', () => {
    expect(resolveVariables(MAP, 1, { item: 'x', index: 2 })).toEqual([
      { name: 'item', type: 'string', value: 'x' },
      { name: 'index', type: 'number', value: 2 },
    ]);
  });

  it('reports a value with no type when the map has none for that name', () => {
    expect(resolveVariables(MAP, 1, { mystery: true })).toEqual([{ name: 'mystery', value: true }]);
  });

  it('reports every value with no type for a null index', () => {
    expect(resolveVariables(MAP, null, { a: 1 })).toEqual([{ name: 'a', value: 1 }]);
  });
});
