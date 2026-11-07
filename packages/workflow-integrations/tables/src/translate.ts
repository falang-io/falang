// oxlint-disable no-undefined -- optional values are modelled with `undefined` throughout (absent filter/field).
import { TABLE_SYSTEM_KEYS } from '@falang/workflow-dto';

/**
 * Names <-> ids for table actions (ADR 0075 (private), decision 3): a node and the user's code speak field NAMES,
 * the wire speaks field IDS. The name -> id map is baked into the compiled build (`__falangTableFields`), so a
 * rename in the editor never changes what a published version sends. Pure and dependency-free (browser-safe).
 */

/** name -> id, as baked by the compiler for one table. */
export type TTableFieldMap = Readonly<Record<string, string>>;

/** A translation problem the user caused (a field removed after the build); never worth a retry. */
export class TablesRequestError extends Error {
  readonly nonRetryable: boolean;
  readonly code?: string;

  constructor(message: string, options: { readonly nonRetryable?: boolean; readonly code?: string } = {}) {
    super(message);
    this.name = 'TablesRequestError';
    this.nonRetryable = options.nonRetryable ?? true;
    this.code = options.code;
  }
}

const SYSTEM_KEYS: ReadonlySet<string> = new Set<string>(TABLE_SYSTEM_KEYS);
const LOGICAL_KEYS: ReadonlySet<string> = new Set(['and', 'or']);

const fieldRemoved = (name: string): TablesRequestError =>
  new TablesRequestError(`field "${name}" no longer exists`, { code: 'field_removed' });

const idOfName = (name: string, fields: TTableFieldMap): string => {
  const id = Object.hasOwn(fields, name) ? fields[name] : undefined;
  if (id === undefined) throw fieldRemoved(name);
  return id;
};

/** id -> name (the baked map inverted). */
export const invertFieldMap = (fields: TTableFieldMap): Record<string, string> => {
  const inverted: Record<string, string> = {};
  for (const [name, id] of Object.entries(fields)) inverted[id] = name;
  return inverted;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Insert `row` / update `set`: every key is a field name (system keys are not writable). */
export const dataToIds = (data: unknown, fields: TTableFieldMap): Record<string, unknown> => {
  if (data === undefined || data === null) return {};
  if (!isPlainObject(data)) throw new TablesRequestError('a record must be an object of field values');
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(data)) {
    if (value === undefined) continue;
    result[idOfName(name, fields)] = value;
  }
  return result;
};

/**
 * A `where` filter: field names (plus system keys, which pass through) as keys; `and`/`or` hold arrays of nested
 * filters. Values — plain equality or an operator object such as `{ gt: 5 }` — are not touched.
 */
export const whereToIds = (where: unknown, fields: TTableFieldMap): Record<string, unknown> | undefined => {
  if (where === undefined || where === null) return undefined;
  if (!isPlainObject(where)) throw new TablesRequestError('where must be an object');
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;
    if (LOGICAL_KEYS.has(key)) {
      if (!Array.isArray(value)) throw new TablesRequestError(`"${key}" must be an array of filters`);
      result[key] = value.map((nested) => whereToIds(nested, fields) ?? {});
    } else if (SYSTEM_KEYS.has(key)) {
      result[key] = value;
    } else {
      result[idOfName(key, fields)] = value;
    }
  }
  return result;
};

/** `"name asc, createdAt desc"` (direction optional, default asc) -> `[{ field: <id|system key>, dir }]`; blank -> `undefined`. */
export const orderByToIds = (
  orderBy: string | undefined,
  fields: TTableFieldMap,
): { field: string; dir: 'asc' | 'desc' }[] | undefined => {
  const text = (orderBy ?? '').trim();
  if (!text) return;
  return text.split(',').map((part) => {
    const [name, dirRaw, ...rest] = part.trim().split(/\s+/);
    const dir = (dirRaw ?? 'asc').toLowerCase();
    if (!name || rest.length > 0 || (dir !== 'asc' && dir !== 'desc')) {
      throw new TablesRequestError(`orderBy: cannot read "${part.trim()}" — use "<field> asc|desc", comma separated`);
    }
    return { field: SYSTEM_KEYS.has(name) ? name : idOfName(name, fields), dir };
  });
};

/** A wire record `{ id, version, createdAt, updatedAt, data: { <id>: v } }` -> the flat name-keyed `Row`; unknown ids are dropped. */
export const recordToRow = (
  record: {
    readonly id: string;
    readonly version: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly data: Readonly<Record<string, unknown>>;
  },
  fields: TTableFieldMap,
): Record<string, unknown> => {
  const idToName = invertFieldMap(fields);
  const row: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(record.data ?? {})) {
    const name = idToName[id];
    if (name !== undefined) row[name] = value;
  }
  return {
    ...row,
    id: record.id,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

/** Name of a field id for an error message (falls back to the id itself). */
export const nameOfFieldId = (id: string, fields: TTableFieldMap): string => invertFieldMap(fields)[id] ?? id;
