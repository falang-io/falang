import type { TypesRegistryStore } from '@falang/typescript-scheme';
// Deep imports, same reasons as `vendor-data-store.ts`: the package roots pull in `monaco-editor`/React
// and this file runs in plain-node Vitest.
import { structTypeToRegistryItem } from '@falang/workflow-scheme/src/registry/seed-integration-types.js';
import { normalizeTableDocumentData, TABLE_DOCUMENT_TYPE } from '@falang/workflow-dto';
import { tableStructTypes } from '@falang/workflow-integrations-tables/src/table-types.js';
import type { WorkflowDocument } from './workflow-types.js';

/** `TypesRegistryStore.updateTypesByParent`'s owning id of one table's derived struct types (ADR 0075 (private) §4). */
export const tableTypesParentId = (docId: string): string => `table:${docId}`;

/**
 * Registers the `Row`/`Insert`/`Patch`/`Where`/`Event` struct types of every `table` document into `typesRegistry`
 * (one `table:<docId>` parent per table, replaced wholesale on each call) and clears the parent of a table that
 * has disappeared since the previous call. `registeredIds` is the caller-owned set of ids already registered.
 * A document whose data does not validate is treated as an empty table (its types are cleared, not left stale).
 */
export const syncTableTypes = (
  typesRegistry: Pick<TypesRegistryStore, 'updateTypesByParent'>,
  documents: readonly Pick<WorkflowDocument, 'id' | 'name' | 'type' | 'customData'>[],
  registeredIds: Set<string>,
): void => {
  const present = new Set<string>();
  for (const doc of documents) {
    if (doc.type !== TABLE_DOCUMENT_TYPE) continue;
    present.add(doc.id);
    const parsed = normalizeTableDocumentData(null, doc.customData);
    const parentId = tableTypesParentId(doc.id);
    const items = parsed.ok
      ? tableStructTypes({ id: doc.id, name: doc.name, data: parsed.data }).map((type) =>
          structTypeToRegistryItem(type, parentId),
        )
      : [];
    typesRegistry.updateTypesByParent(parentId, items);
    registeredIds.add(doc.id);
  }
  for (const id of Array.from(registeredIds)) {
    if (present.has(id)) continue;
    typesRegistry.updateTypesByParent(tableTypesParentId(id), []);
    registeredIds.delete(id);
  }
};
