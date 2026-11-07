import { randomUUID } from 'node:crypto';
import { TABLE_DOCUMENT_TYPE } from '@falang/workflow-dto';

/** Node-`data` field name of a `document-ref` field pointing at a `table` document (the `tables` vendor's actions and triggers). */
const TABLE_REF_KEY = 'table';
const TABLE_STRUCT_ID = /^table:([^#:]+)((?:#[a-z]+)?)$/;

/** Old id -> freshly minted one, for every `table` document of an import payload (document ids are re-minted on import). */
export const buildTableIdMap = (documents: readonly { id: string; type: string }[]): Map<string, string> =>
  new Map(documents.filter((document) => document.type === TABLE_DOCUMENT_TYPE).map((d) => [d.id, randomUUID()]));

const remapString = (key: string | undefined, value: string, idMap: ReadonlyMap<string, string>): string => {
  if (key === TABLE_REF_KEY) return idMap.get(value) ?? value;
  const struct = TABLE_STRUCT_ID.exec(value);
  if (struct) {
    const mapped = idMap.get(struct[1]);
    if (mapped) return `table:${mapped}${struct[2]}`;
  }
  return value;
};

/**
 * Deep-copies `value`, rewriting every reference to an imported `table` document through `idMap`: a `table` property
 * (a `document-ref` field value) and `table:<id>[#variant]` struct ids. Table documents get new ids on import, so the
 * references in other documents' `root`/`data` would otherwise dangle.
 */
export const remapDocumentRefs = (value: unknown, idMap: ReadonlyMap<string, string>, key?: string): unknown => {
  if (idMap.size === 0) return value;
  if (typeof value === 'string') return remapString(key, value, idMap);
  if (Array.isArray(value)) return value.map((item) => remapDocumentRefs(item, idMap, key));
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) {
      result[childKey] = remapDocumentRefs(child, idMap, childKey);
    }
    return result;
  }
  return value;
};
