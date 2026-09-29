import { debugLocationKey, type IDebugLocation, type IDebugMap, type IDebugVariable, type TDebugValue } from '@falang/debug';

/**
 * Translates between the diagram's `{documentId, nodeId}` locations (what the client and the debug
 * protocol speak) and the compiled runtime's dense trace indexes (what the Temporal signals/query
 * actually carry, see ADR 0021 (private)'s `IDebugMap`). Pure, so it's unit-testable without a
 * Temporal client — `DebugService` is the only caller.
 */

/** Resolves each requested location to its trace index, silently dropping any that aren't in the map (e.g. a breakpoint on a node kind that isn't a statement, or a stale one from a document that no longer exists). */
export const resolveLocationsToIndices = (map: IDebugMap, locations: readonly IDebugLocation[]): number[] => {
  const indexByLocation = new Map(map.tracePoints.map((tracePoint) => [debugLocationKey(tracePoint), tracePoint.index]));
  const indices: number[] = [];
  for (const location of locations) {
    const index = indexByLocation.get(debugLocationKey(location));
    if (typeof index === 'number') indices.push(index);
  }
  return indices;
};

/** `null` for a `null` index (nothing has run yet) or an index the map doesn't know about (a stale session against a since-rebuilt dev artifact). */
export const resolveIndexToLocation = (map: IDebugMap, index: number | null): IDebugLocation | null => {
  if (index === null) return null;
  const tracePoint = map.tracePoints.find((candidate) => candidate.index === index);
  return tracePoint ? { documentId: tracePoint.documentId, nodeId: tracePoint.nodeId } : null;
};

/** Combines the query's live `name → value` snapshot with the map's compile-time `name → type` metadata for the same trace point. A name the map doesn't know about (shouldn't happen — the runtime only ever snapshots what the map recorded for that index) is still reported, just without a `type`. */
export const resolveVariables = (
  map: IDebugMap,
  index: number | null,
  values: Readonly<Record<string, unknown>>,
): IDebugVariable[] => {
  const tracePoint = index === null ? null : (map.tracePoints.find((candidate) => candidate.index === index) ?? null);
  const typeByName = new Map((tracePoint?.variables ?? []).map((variable) => [variable.name, variable.type]));
  return Object.entries(values).map(([name, value]) => ({ name, type: typeByName.get(name), value: value as TDebugValue }));
};
