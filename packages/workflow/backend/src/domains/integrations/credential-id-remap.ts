import { randomUUID } from 'node:crypto';
import { extractInstanceIds } from './credential-id-ownership.js';

/** Node-`data` field names that hold an integration instance id (every `credential-ref` field in the codebase is one of these two). */
const INSTANCE_REF_KEYS: ReadonlySet<string> = new Set(['credentialId', 'integration']);
const TABLE_STRUCT_ID_PREFIX = /^db:([^:]+):/;

/** Old instance id -> freshly minted one, for every instance of an imported `integrations` document. */
export const buildCredentialIdMap = (integrationsData: unknown): Map<string, string> =>
  new Map(extractInstanceIds(integrationsData).map((id) => [id, randomUUID()]));

const remapString = (key: string | undefined, value: string, idMap: ReadonlyMap<string, string>): string => {
  if (typeof key === 'string' && INSTANCE_REF_KEYS.has(key)) return idMap.get(value) ?? value;
  const struct = TABLE_STRUCT_ID_PREFIX.exec(value);
  if (struct) {
    const mapped = idMap.get(struct[1]);
    if (mapped) return `db:${mapped}:${value.slice(struct[0].length)}`;
  }
  return value;
};

/**
 * Deep-copies `value`, rewriting every reference to an imported instance id (`credentialId`/
 * `integration` properties — trigger-function bodies, integration/ActivePieces action nodes — and
 * `db:<instanceId>:<table>` struct ids) through `idMap`. Instance ids are client-chosen and become
 * platform routing keys, so an import must never keep the ids of the file it came from (security audit
 * P0-6, ADR 0044 (private)). The `integrations` document's own `instances[].id` is rewritten with
 * `remapIntegrationsData`.
 */
export const remapCredentialRefs = (value: unknown, idMap: ReadonlyMap<string, string>, key?: string): unknown => {
  if (typeof value === 'string') return remapString(key, value, idMap);
  if (Array.isArray(value)) return value.map((item) => remapCredentialRefs(item, idMap, key));
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) {
      result[childKey] = remapCredentialRefs(child, idMap, childKey);
    }
    return result;
  }
  return value;
};

/** Rewrites each `instances[].id` of an `integrations` document's data. */
export const remapIntegrationsData = (data: unknown, idMap: ReadonlyMap<string, string>): unknown => {
  if (typeof data !== 'object' || data === null) return data;
  const instances = (data as { instances?: unknown }).instances;
  if (!Array.isArray(instances)) return data;
  return {
    ...data,
    // oxlint-disable-next-line no-map-spread -- one small object per instance.
    instances: instances.map((instance) => {
      const id = (instance as { id?: unknown } | null)?.id;
      if (typeof id !== 'string' || !idMap.has(id)) return instance;
      return { ...(instance as Record<string, unknown>), id: idMap.get(id) };
    }),
  };
};
