/**
 * Struct-id scheme for synced tables — ADR 0039 (private) §5. A struct id is
 * a *value* derivable from a node's own `credentialId`/`table` field values (no lookup needed), the
 * same trick Ozon's `OZON_METHOD_STRUCT_ID[fields.method]` uses.
 */

const TABLE_ID_RE = /^db:([^:]+):([^#]+)(?:#(insert|patch|where))?$/;

export type TTableStructVariant = 'insert' | 'patch' | 'where';

/** `db:<instanceId>:<schema>.<table>` — no schema (SQLite, or an unqualified table) omits the dot: `db:<instanceId>:<table>`. */
export const tableStructId = (instanceId: string, schema: string | null, table: string): string =>
  `db:${instanceId}:${schema ? `${schema}.${table}` : table}`;

export const tableInsertStructId = (instanceId: string, schema: string | null, table: string): string =>
  `${tableStructId(instanceId, schema, table)}#insert`;

export const tablePatchStructId = (instanceId: string, schema: string | null, table: string): string =>
  `${tableStructId(instanceId, schema, table)}#patch`;

export const tableWhereStructId = (instanceId: string, schema: string | null, table: string): string =>
  `${tableStructId(instanceId, schema, table)}#where`;

export interface IParsedTableStructId {
  readonly instanceId: string;
  readonly schema: string | null;
  readonly table: string;
  readonly variant?: TTableStructVariant;
}

/** Inverse of `tableStructId`/`tableInsertStructId`/`tablePatchStructId`/`tableWhereStructId`. `undefined` when `id` isn't one of these. */
export const parseTableStructId = (id: string): IParsedTableStructId | undefined => {
  const match = TABLE_ID_RE.exec(id);
  if (!match) return;
  const [, instanceId, tablePart, variant] = match;
  const dotIndex = tablePart.indexOf('.');
  const schema = dotIndex === -1 ? null : tablePart.slice(0, dotIndex);
  const table = dotIndex === -1 ? tablePart : tablePart.slice(dotIndex + 1);
  return { instanceId, schema, table, variant: variant as TTableStructVariant | undefined };
};

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** PascalCases one name segment — `"order_items"` -> `"OrderItems"`, `"2024_orders"` -> `"2024Orders"` (fixed up by the caller if it can't start an identifier). */
const toPascalSegment = (value: string): string => {
  const cleaned = value.replaceAll(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!cleaned) return '_';
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
};

/** `structName('Shop Db', 'orders')` -> `"ShopDb_Orders"` — a valid TS identifier (ADR 0039 (private) §5). */
export const structName = (instanceName: string, table: string): string => {
  const base = `${toPascalSegment(instanceName)}_${toPascalSegment(table)}`;
  return IDENTIFIER_RE.test(base) ? base : `_${base}`;
};
