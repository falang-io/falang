/** Normalisation of table cell values and whole records (ADR 0075 (private)). Browser-safe. */
import type { ITableField } from './table-document.js';
import { hasTableFieldDefault, isTableFieldId } from './table-document.js';
import { normalizeFieldValue } from './table-field-value.js';
import type { TTableErrorCode } from './table-rest.js';

export { normalizeFieldValue } from './table-field-value.js';
export type { ITableFileRef, TFieldValueResult } from './table-field-value.js';

export type TRecordDataResult =
  | {
      ok: true;
      /** The values to store/merge, keyed by field id (no cleared keys). */
      data: Record<string, unknown>;
      /** Field ids cleared by an explicit `null` (patch mode only; always empty for insert). */
      unset: string[];
    }
  | { ok: false; code: TTableErrorCode; message: string; field?: string };

/**
 * Validates a whole record write keyed by FIELD ID. `insert`: unknown ids are rejected, omitted required fields get
 * their defaults, and `required` fields without a default must be present and non-null. `patch`: only the given ids are
 * touched, `null` clears (rejected for a required field).
 */
export const normalizeRecordData = (
  fields: readonly ITableField[],
  input: Record<string, unknown>,
  mode: 'insert' | 'patch',
): TRecordDataResult => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, code: 'validation', message: 'Record data must be an object' };
  }
  const byId = new Map(fields.map((field) => [field.id, field]));
  const data: Record<string, unknown> = {};
  const unset: string[] = [];

  for (const [key, raw] of Object.entries(input)) {
    const field = isTableFieldId(key) ? byId.get(key) : null;
    if (!field) return { ok: false, code: 'unknown_field', message: `Unknown field "${key}"`, field: key };
    const result = normalizeFieldValue(field, raw);
    if (!result.ok) return { ok: false, code: result.code, message: result.message, field: key };
    if (result.value === null) {
      if (field.required) {
        return { ok: false, code: 'required_field', message: `Field "${field.name}" is required`, field: key };
      }
      if (mode === 'patch') unset.push(key);
    } else {
      data[key] = result.value;
    }
  }

  if (mode === 'insert') {
    for (const field of fields) {
      if (!Object.hasOwn(input, field.id) && hasTableFieldDefault(field)) {
        const result = normalizeFieldValue(field, field.defaultValue);
        if (!result.ok) return { ok: false, code: result.code, message: result.message, field: field.id };
        if (result.value !== null) data[field.id] = result.value;
      }
      if (field.required && !(field.id in data)) {
        return { ok: false, code: 'required_field', message: `Field "${field.name}" is required`, field: field.id };
      }
    }
  }
  return { ok: true, data, unset };
};

/** UTF-8 size of a record's JSON — compared with the `maxTableRecordBytes` limit. */
export const recordDataByteLength = (data: Record<string, unknown>): number =>
  new TextEncoder().encode(JSON.stringify(data)).length;
