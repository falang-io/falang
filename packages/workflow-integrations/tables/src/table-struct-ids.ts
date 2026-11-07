/**
 * Struct-id scheme for project tables (ADR 0075 (private)): derived from the `table` document's id alone,
 * so a node's `table` field value is enough to find the struct (same trick as sql-common's `db:` ids).
 * Ids follow the document id, so renaming a table never breaks a reference.
 */

export type TTableStructVariant = 'insert' | 'patch' | 'where' | 'event';

const TABLE_STRUCT_ID_RE = /^table:([^#:]+)(?:#(insert|patch|where|event))?$/;

/** `table:<docId>` — the `Row` struct. */
export const tableRowStructId = (docId: string): string => `table:${docId}`;
export const tableInsertStructId = (docId: string): string => `table:${docId}#insert`;
export const tablePatchStructId = (docId: string): string => `table:${docId}#patch`;
export const tableWhereStructId = (docId: string): string => `table:${docId}#where`;
/** The trigger scope struct `{ table, record, previous?, changedFields?, source }`. */
export const tableEventStructId = (docId: string): string => `table:${docId}#event`;

export interface IParsedTableStructId {
  readonly docId: string;
  /** `undefined` for the `Row` struct itself. */
  readonly variant?: TTableStructVariant;
}

/** Inverse of the builders above; `undefined` for any other id (e.g. sql-common's `db:…`). */
export const parseTableStructId = (id: string): IParsedTableStructId | undefined => {
  const match = TABLE_STRUCT_ID_RE.exec(id);
  if (!match) return;
  return { docId: match[1], variant: match[2] as TTableStructVariant | undefined };
};
