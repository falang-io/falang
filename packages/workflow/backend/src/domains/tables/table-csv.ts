import type { ITableField } from '@falang/workflow-dto';

/** Pure CSV parsing/formatting for table import/export (ADR 0075 (private)). RFC 4180 quoting, optional BOM. */

export const CSV_BOM = '\uFEFF';

/** Parses CSV text into rows of cells. Handles a BOM, `\r\n`/`\n`, quoted cells with `""` escapes and embedded newlines. Fully blank lines are dropped. */
export const parseCsv = (input: string): string[][] => {
  const text = input.startsWith(CSV_BOM) ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let wasQuoted = false;
  let wasQuotedRow = false;
  const endCell = (): void => {
    row.push(cell);
    cell = '';
    wasQuoted = false;
  };
  const endRow = (): void => {
    endCell();
    if (row.length > 1 || row[0] !== '' || wasQuotedRow) rows.push(row);
    row = [];
    wasQuotedRow = false;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else inQuotes = false;
      } else cell += char;
      continue;
    }
    if (char === '"' && cell === '' && !wasQuoted) {
      inQuotes = true;
      wasQuoted = true;
      wasQuotedRow = true;
    } else if (char === ',') endCell();
    else if (char === '\n') endRow();
    else if (char === '\r') {
      if (text[index + 1] !== '\n') endRow();
    } else cell += char;
  }
  if (cell !== '' || row.length > 0 || wasQuoted) endRow();
  return rows;
};

const needsQuotes = (cell: string): boolean => /[",\r\n]/.test(cell) || cell !== cell.trim();

export const formatCsvCell = (cell: string): string => (needsQuotes(cell) ? `"${cell.replaceAll('"', '""')}"` : cell);

export const formatCsvRow = (cells: readonly string[]): string => cells.map((cell) => formatCsvCell(cell)).join(',');

/** One stored cell as CSV text: files = the file id, json = JSON text, booleans `true`/`false`, empty = ''. */
export const valueToCsvCell = (field: ITableField, value: unknown): string => {
  if ((value ?? null) === null) return '';
  switch (field.type) {
    case 'file': {
      return typeof value === 'object' && value !== null ? String((value as { id?: unknown }).id ?? '') : '';
    }
    case 'json': {
      return JSON.stringify(value);
    }
    default: {
      return String(value);
    }
  }
};

export type TCsvCellResult = { ok: true; value: unknown } | { ok: false; message: string };

const TRUE_WORDS = new Set(['true', '1', 'yes']);
const FALSE_WORDS = new Set(['false', '0', 'no']);

/**
 * Parses one CSV cell to a value for the field (not yet validated by `normalizeFieldValue`, which the caller still
 * applies). '' = empty (`null`). A `file` cell cannot be imported (the file would have to exist), so it is an error.
 */
export const csvCellToValue = (field: ITableField, cell: string): TCsvCellResult => {
  const text = cell.trim();
  if (text === '') return { ok: true, value: null };
  switch (field.type) {
    case 'number': {
      const value = Number(text);
      return Number.isFinite(value) ? { ok: true, value } : { ok: false, message: `"${cell}" is not a number` };
    }
    case 'boolean': {
      const lowered = text.toLowerCase();
      if (TRUE_WORDS.has(lowered)) return { ok: true, value: true };
      if (FALSE_WORDS.has(lowered)) return { ok: true, value: false };
      return { ok: false, message: `"${cell}" is not true/false` };
    }
    case 'json': {
      try {
        return { ok: true, value: JSON.parse(text) as unknown };
      } catch {
        return { ok: false, message: `"${cell}" is not valid JSON` };
      }
    }
    case 'file': {
      return { ok: false, message: 'File cells cannot be imported from CSV' };
    }
    default: {
      return { ok: true, value: field.type === 'text' ? cell : text };
    }
  }
};
