/**
 * The `table` document: the schema of a project table (ADR 0075 (private)). Records live in the
 * backend's database, not in the document; the document holds only the field definitions.
 * Browser-safe: no `node:*`, no `process.env`, no `Buffer`.
 */

export const TABLE_DOCUMENT_TYPE = 'table';

export const TABLE_FIELD_TYPES = ['text', 'number', 'boolean', 'date', 'datetime', 'select', 'json', 'file'] as const;
export type TTableFieldType = (typeof TABLE_FIELD_TYPES)[number];

export interface ITableField {
  /** Stable id `f1`, `f2`, … — never reused, survives renames. Records and compiled code are keyed by it. */
  id: string;
  /** Human name; unique case-insensitively within the table; identifier-safe (Unicode letters allowed). */
  name: string;
  type: TTableFieldType;
  required?: boolean;
  /** Only for `select`: the allowed values. */
  options?: string[];
  description?: string;
}

export interface ITableDocumentData {
  fields: ITableField[];
  /** The number the next created field gets (`f<nextFieldNo>`); monotone, never lowered. */
  nextFieldNo: number;
}

/** Keys every record has besides its fields; usable in `where`/`orderBy`, never as a field name. */
export const TABLE_SYSTEM_KEYS = ['id', 'version', 'createdAt', 'updatedAt'] as const;

export const TABLE_RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set<string>([
  ...TABLE_SYSTEM_KEYS,
  'and',
  'or',
  '__proto__',
  'constructor',
  'prototype',
]);

export const TABLE_MAX_FIELDS_HARD_CAP = 500;
export const TABLE_FIELD_NAME_MAX_LENGTH = 64;
export const TABLE_FIELD_DESCRIPTION_MAX_LENGTH = 500;
export const TABLE_SELECT_MAX_OPTIONS = 100;

const RESERVED_LOWER: ReadonlySet<string> = new Set([...TABLE_RESERVED_FIELD_NAMES].map((name) => name.toLowerCase()));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const FIELD_ID_RE = /^f([1-9]\d*)$/;
const FIELD_NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

export const isTableFieldId = (value: string): boolean => FIELD_ID_RE.test(value);

export const emptyTableData = (): ITableDocumentData => ({ fields: [], nextFieldNo: 1 });

type TNormalizeFieldResult = { ok: true; field: ITableField } | { ok: false; error: string };

const normalizeSelectOptions = (
  where: string,
  options: unknown,
): { ok: true; options: string[] } | { ok: false; error: string } => {
  if (!Array.isArray(options) || options.length === 0) {
    return { ok: false, error: `${where}: a select field needs a non-empty "options" list` };
  }
  if (options.length > TABLE_SELECT_MAX_OPTIONS) {
    return { ok: false, error: `${where}: at most ${TABLE_SELECT_MAX_OPTIONS} options` };
  }
  const seen = new Set<string>();
  for (const option of options) {
    if (typeof option !== 'string' || option.length === 0) {
      return { ok: false, error: `${where}: options must be non-empty strings` };
    }
    if (seen.has(option)) return { ok: false, error: `${where}: duplicate option "${option}"` };
    seen.add(option);
  }
  return { ok: true, options: [...(options as string[])] };
};

const normalizeFieldName = (where: string, raw: unknown): { ok: true; name: string } | { ok: false; error: string } => {
  if (typeof raw !== 'string') return { ok: false, error: `${where}.name must be a string` };
  const name = raw.trim();
  if (name.length === 0 || name.length > TABLE_FIELD_NAME_MAX_LENGTH) {
    return { ok: false, error: `${where}.name must be 1..${TABLE_FIELD_NAME_MAX_LENGTH} characters` };
  }
  if (!FIELD_NAME_RE.test(name)) {
    return {
      ok: false,
      error: `Field name "${name}" must start with a letter or "_" and contain only letters, digits and "_"`,
    };
  }
  if (RESERVED_LOWER.has(name.toLowerCase())) return { ok: false, error: `Field name "${name}" is reserved` };
  return { ok: true, name };
};

/** Validates one field entry; `ids`/`names` (lower-cased) accumulate across the table to detect duplicates. */
const normalizeField = (item: unknown, index: number, ids: Set<string>, names: Set<string>): TNormalizeFieldResult => {
  const where = `fields[${index}]`;
  if (!isRecord(item)) return { ok: false, error: `${where} must be an object` };
  const id = item.id;
  if (typeof id !== 'string' || !FIELD_ID_RE.test(id)) {
    return { ok: false, error: `${where}.id must look like "f1", "f2", …` };
  }
  if (ids.has(id)) return { ok: false, error: `Duplicate field id "${id}"` };
  ids.add(id);

  const named = normalizeFieldName(where, item.name);
  if (!named.ok) return named;
  const lowered = named.name.toLowerCase();
  if (names.has(lowered)) return { ok: false, error: `Duplicate field name "${named.name}"` };
  names.add(lowered);

  const type = item.type;
  if (typeof type !== 'string' || !(TABLE_FIELD_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: `${where}.type must be one of ${TABLE_FIELD_TYPES.join(', ')}` };
  }
  const field: ITableField = { id, name: named.name, type: type as TTableFieldType };
  if (item.required === true) field.required = true;
  if (type === 'select') {
    const options = normalizeSelectOptions(where, item.options);
    if (!options.ok) return options;
    field.options = options.options;
  }
  const description = item.description;
  if ((description ?? null) !== null && description !== '') {
    if (typeof description !== 'string' || description.length > TABLE_FIELD_DESCRIPTION_MAX_LENGTH) {
      return {
        ok: false,
        error: `${where}.description must be a string up to ${TABLE_FIELD_DESCRIPTION_MAX_LENGTH} characters`,
      };
    }
    field.description = description;
  }
  return { ok: true, field };
};

export type TNormalizeTableResult = { ok: true; data: ITableDocumentData } | { ok: false; error: string };

const fieldIdNumber = (id: string): number => Number(FIELD_ID_RE.exec(id)?.[1] ?? 0);

/**
 * Validates and normalises a table document's `data`. `null`/`undefined` -> an empty definition.
 * `nextFieldNo` is normalised, never rejected: `max(raw, prev, maxIdNumber + 1)`, so restoring an
 * older definition can never make an id reusable.
 */
export const normalizeTableDocumentData = (prev: ITableDocumentData | null, raw: unknown): TNormalizeTableResult => {
  if ((raw ?? null) === null) return { ok: true, data: emptyTableData() };
  if (!isRecord(raw)) return { ok: false, error: 'Table data must be an object { fields, nextFieldNo }' };
  const rawFields = raw.fields ?? [];
  if (!Array.isArray(rawFields)) return { ok: false, error: '"fields" must be an array' };
  if (rawFields.length > TABLE_MAX_FIELDS_HARD_CAP) {
    return { ok: false, error: `A table can have at most ${TABLE_MAX_FIELDS_HARD_CAP} fields` };
  }

  const fields: ITableField[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  let maxIdNumber = 0;

  for (const [index, item] of rawFields.entries()) {
    const result = normalizeField(item, index, ids, names);
    if (!result.ok) return result;
    maxIdNumber = Math.max(maxIdNumber, fieldIdNumber(result.field.id));
    fields.push(result.field);
  }

  const rawNext = typeof raw.nextFieldNo === 'number' && Number.isFinite(raw.nextFieldNo) ? raw.nextFieldNo : 1;
  const nextFieldNo = Math.max(Math.floor(rawNext), prev?.nextFieldNo ?? 1, maxIdNumber + 1, 1);
  return { ok: true, data: { fields, nextFieldNo } };
};

/** `{ fieldName: fieldId }` — what the compiler bakes into `__falangTableFields` for one table. */
export const tableFieldNameToId = (data: ITableDocumentData | null | undefined): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const field of data?.fields ?? []) result[field.name] = field.id;
  return result;
};
