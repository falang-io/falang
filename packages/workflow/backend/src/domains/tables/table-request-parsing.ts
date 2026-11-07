// oxlint-disable no-undefined -- absent query values are modelled as `undefined`.
import { PayloadTooLargeException } from '@nestjs/common';
import type { TTableEnv, TTableSortDir } from '@falang/workflow-dto';
import type { Request } from 'express';
import { TablesError } from './table-errors.js';

/** Hand-rolled parsing of the tables routes' query/body values (bodies are `unknown`, errors are `TablesError`s). */

export const CSV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseEnv = (value: unknown, fallback: TTableEnv | null = 'dev'): TTableEnv => {
  if (value === 'dev' || value === 'prod') return value;
  if ((value ?? '') === '' && fallback) return fallback;
  throw new TablesError('validation', '"env" must be "dev" or "prod"');
};

export const parseInteger = (value: unknown, label: string): number | undefined => {
  if ((value ?? '') === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isInteger(parsed)) throw new TablesError('validation', `"${label}" must be an integer`);
  return parsed;
};

export const parseSortDir = (value: unknown): TTableSortDir | undefined => {
  if ((value ?? '') === '') return undefined;
  if (value === 'asc' || value === 'desc') return value;
  throw new TablesError('validation', '"sortDir" must be "asc" or "desc"');
};

export const requireObject = (value: unknown, label: string): Record<string, unknown> => {
  if (!isPlainObject(value)) throw new TablesError('validation', `"${label}" must be an object`);
  return value;
};

export const optionalObject = (value: unknown, label: string): Record<string, unknown> | undefined =>
  (value ?? null) === null ? undefined : requireObject(value, label);

export const parseBoolean = (value: unknown): boolean => value === true || value === 'true';

/** The raw request body as UTF-8 text, at most `maxBytes`. */
export const readTextBody = async (req: Request & { rawBody?: Buffer }, maxBytes: number): Promise<string> => {
  if (Buffer.isBuffer(req.rawBody)) {
    if (req.rawBody.length > maxBytes) throw new PayloadTooLargeException(`The body is limited to ${maxBytes} bytes`);
    return req.rawBody.toString('utf8');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > maxBytes) throw new PayloadTooLargeException(`The body is limited to ${maxBytes} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
};
