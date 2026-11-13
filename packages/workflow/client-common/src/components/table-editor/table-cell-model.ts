import dayjs from 'dayjs';
import { hasTableFieldDefault, normalizeFieldValue, type ITableField, type ITableFileRef } from '@falang/workflow-dto';

/** Pure helpers for showing and parsing grid cells (ADR 0075 (private)). Datetimes are shown in the viewer's zone and sent as ISO. */

const isUnset = (value: unknown): boolean => (value ?? null) === null;

export const isFileRef = (value: unknown): value is ITableFileRef =>
  typeof value === 'object' && value !== null && typeof (value as ITableFileRef).id === 'string';

/** Text shown in a cell while it is not being edited. */
export const formatCell = (field: ITableField, value: unknown): string => {
  if (isUnset(value)) return '';
  switch (field.type) {
    case 'boolean': {
      return value === true ? '✓' : '';
    }
    case 'datetime': {
      const parsed = dayjs(String(value));
      return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : String(value);
    }
    case 'json': {
      return JSON.stringify(value);
    }
    case 'file': {
      return isFileRef(value) ? value.name : '';
    }
    default: {
      return String(value);
    }
  }
};

/** A `datetime` edited as a dayjs value -> the ISO string sent to the backend (always UTC `Z`). */
export const datetimeToIso = (picked: dayjs.Dayjs): string => picked.toISOString();

/** A `date` edited as a dayjs value -> `YYYY-MM-DD`. */
export const dateToString = (picked: dayjs.Dayjs): string => picked.format('YYYY-MM-DD');

export type TParsedCell = { ok: true; value: unknown } | { ok: false; message: string };

/** Validates an edited value before sending it; `null`/`''`/`undefined` clear the cell. */
export const parseCellInput = (field: ITableField, raw: unknown): TParsedCell => {
  const cleared = isUnset(raw) || raw === '';
  const result = normalizeFieldValue(field, cleared ? null : raw);
  return result.ok ? { ok: true, value: result.value } : { ok: false, message: result.message };
};

/** Parses text typed into the JSON modal; empty text clears the cell. */
export const parseJsonCellText = (text: string): TParsedCell => {
  if (text.trim() === '') return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Invalid JSON' };
  }
};

export const jsonCellText = (value: unknown): string => (isUnset(value) ? '' : JSON.stringify(value, null, 2));

/** `data` of a PATCH for one cell: a cleared cell is sent as `null`. */
export const buildCellPatch = (field: ITableField, value: unknown): Record<string, unknown> => ({
  [field.id]: value ?? null,
});

/** Drops cleared (`null`/`undefined`/`''`) entries of a form's draft, keeping them out of an insert. */
export const buildInsertData = (draft: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(draft).filter(([, value]) => !isUnset(value) && value !== ''));

/** Required fields with neither an insert value nor a default. */
export const missingRequiredFields = (fields: readonly ITableField[], data: Record<string, unknown>): ITableField[] =>
  fields.filter((field) => field.required && !hasTableFieldDefault(field) && isUnset(data[field.id]));
