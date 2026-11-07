import type { IProjectDocument } from '@falang/dto';
import { TABLE_DOCUMENT_TYPE, tableFieldNameToId, type ITableDocumentData } from '@falang/workflow-dto';

/** Vendor id of `@falang/workflow-integrations-tables` (kept as a literal — the compiler does not depend on vendor packages). */
export const TABLES_VENDOR_ID = 'tables';

/**
 * `{ [tableDocumentId]: { [fieldName]: fieldId } }` for EVERY `table` document of the project (an action may point
 * at any of them). Baked into the activities module as `__falangTableFields`, so a published version keeps sending
 * the ids it was built with whatever the user renames later (ADR 0075 (private), decision 3).
 */
export const collectTableFields = (documents: readonly IProjectDocument[]): Record<string, Record<string, string>> => {
  const result: Record<string, Record<string, string>> = {};
  for (const document of documents) {
    if (document.type !== TABLE_DOCUMENT_TYPE) continue;
    result[document.id] = tableFieldNameToId(document.data as ITableDocumentData | undefined);
  }
  return result;
};
