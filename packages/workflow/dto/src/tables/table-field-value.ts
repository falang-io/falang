import type { ITableField } from './table-document.js';
import type { TTableErrorCode } from './table-rest.js';

/** A file cell: the file reference without `publicUrl` (a published link is minted on demand, never stored). */
export interface ITableFileRef {
  id: string;
  name: string;
  size: number;
  mime: string;
}

export type TFieldValueResult =
  /** `value === null` means "the key is cleared" (a stored cell is never `null`). */
  { ok: true; value: unknown } | { ok: false; code: TTableErrorCode; message: string };

/** `files.id` is 16 random bytes in base64url (22 chars), not a uuid. */
const FILE_ID_RE = /^[\w-]{1,64}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const isRealDate = (year: number, month: number, day: number): boolean =>
  month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);

const isJsonValue = (value: unknown, depth = 0): boolean => {
  if (depth > 64) return false;
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean': {
      return true;
    }
    case 'number': {
      return Number.isFinite(value);
    }
    case 'object': {
      if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
      const proto = Object.getPrototypeOf(value) as unknown;
      if (proto !== Object.prototype && proto !== null) return false;
      return Object.values(value as Record<string, unknown>).every((item) => isJsonValue(item, depth + 1));
    }
    default: {
      return false;
    }
  }
};

const fail = (code: TTableErrorCode, message: string): TFieldValueResult => ({ ok: false, code, message });

const normalizeDate = (field: ITableField, raw: unknown): TFieldValueResult => {
  if (typeof raw !== 'string') return fail('invalid_type', `Field "${field.name}" expects a date string YYYY-MM-DD`);
  const match = DATE_RE.exec(raw);
  if (!match || !isRealDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    return fail('invalid_date', `Field "${field.name}": "${raw}" is not a valid date (YYYY-MM-DD)`);
  }
  return { ok: true, value: raw };
};

const normalizeDatetime = (field: ITableField, raw: unknown): TFieldValueResult => {
  if (typeof raw !== 'string')
    return fail('invalid_type', `Field "${field.name}" expects an ISO 8601 date-time string`);
  let text = raw.trim();
  if (DATE_RE.test(text)) text = `${text}T00:00:00`;
  const match = DATETIME_RE.exec(text);
  if (
    !match ||
    !isRealDate(Number(match[1]), Number(match[2]), Number(match[3])) ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6] ?? 0) > 59
  ) {
    return fail('invalid_date', `Field "${field.name}": "${raw}" is not a valid ISO 8601 date-time`);
  }
  let zone = match[7] ?? 'Z';
  if (zone.toUpperCase() === 'Z') zone = 'Z';
  else {
    const digits = zone.slice(1).replace(':', '');
    zone = `${zone[0]}${digits.slice(0, 2)}:${digits.slice(2) || '00'}`;
  }
  const seconds = match[6] ?? '00';
  const fraction = /\.\d+/.exec(text)?.[0] ?? '';
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${seconds}${fraction}${zone}`;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return fail('invalid_date', `Field "${field.name}": "${raw}" is not a valid date-time`);
  return { ok: true, value: new Date(time).toISOString() };
};

const normalizeFile = (field: ITableField, raw: unknown): TFieldValueResult => {
  if (!isRecord(raw))
    return fail('invalid_file', `Field "${field.name}" expects a file reference { id, name, size, mime }`);
  const { id, name, size, mime } = raw;
  if (typeof id !== 'string' || !FILE_ID_RE.test(id)) {
    return fail('invalid_file', `Field "${field.name}": file "id" must be a file id string`);
  }
  if (typeof name !== 'string' || typeof mime !== 'string') {
    return fail('invalid_file', `Field "${field.name}": file "name" and "mime" must be strings`);
  }
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    return fail('invalid_file', `Field "${field.name}": file "size" must be a non-negative number`);
  }
  const value: ITableFileRef = { id, name, size, mime };
  return { ok: true, value };
};

/**
 * Validates one cell value against its field. `null` clears the key (`value: null`); `undefined`
 * is treated the same. Whether a cleared value is allowed (`required`) is `normalizeRecordData`'s call.
 */
export const normalizeFieldValue = (field: ITableField, raw: unknown): TFieldValueResult => {
  if ((raw ?? null) === null) return { ok: true, value: null };
  switch (field.type) {
    case 'text': {
      return typeof raw === 'string'
        ? { ok: true, value: raw }
        : fail('invalid_type', `Field "${field.name}" expects a string`);
    }
    case 'number': {
      return typeof raw === 'number' && Number.isFinite(raw)
        ? { ok: true, value: raw }
        : fail('invalid_type', `Field "${field.name}" expects a finite number`);
    }
    case 'boolean': {
      return typeof raw === 'boolean'
        ? { ok: true, value: raw }
        : fail('invalid_type', `Field "${field.name}" expects true or false`);
    }
    case 'date': {
      return normalizeDate(field, raw);
    }
    case 'datetime': {
      return normalizeDatetime(field, raw);
    }
    case 'select': {
      if (typeof raw !== 'string') return fail('invalid_type', `Field "${field.name}" expects one of its options`);
      return (field.options ?? []).includes(raw)
        ? { ok: true, value: raw }
        : fail('invalid_option', `Field "${field.name}": "${raw}" is not one of ${(field.options ?? []).join(', ')}`);
    }
    case 'json': {
      return isJsonValue(raw)
        ? { ok: true, value: raw }
        : fail('invalid_type', `Field "${field.name}" expects a JSON-serialisable value`);
    }
    case 'file': {
      return normalizeFile(field, raw);
    }
    default: {
      return fail('invalid_type', `Field "${field.name}" has an unknown type`);
    }
  }
};
