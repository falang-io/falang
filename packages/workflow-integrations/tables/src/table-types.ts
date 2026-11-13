import type { TVariableInfo } from '@falang/typescript-dto';
import { hasTableFieldDefault, type ITableDocumentData, type ITableField } from '@falang/workflow-dto';
import type { IIntegrationStructType } from '@falang/workflow-integrations-common';
import {
  ANY_FILTER_TYPE_ID,
  BOOLEAN_FILTER_TYPE_ID,
  NUMBER_FILTER_TYPE_ID,
  STRING_FILTER_TYPE_ID,
} from '@falang/workflow-integrations-sql-common';
import {
  tableEventStructId,
  tableInsertStructId,
  tablePatchStructId,
  tableRowStructId,
  tableWhereStructId,
} from './table-struct-ids.js';

/** `IIntegrationStructType.id` of the `File` struct owned by the `files` vendor (kept as a literal: this package must not depend on it). */
const FILE_TYPE_ID = 'files/File';

export interface ITableDocumentLike {
  readonly id: string;
  readonly name: string;
  readonly data: ITableDocumentData;
}

const IDENTIFIER_RE = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;

/**
 * PascalCases a table name into a TypeScript identifier ("my clients" -> "MyClients", "клиенты" -> "Клиенты").
 * Unicode letters are kept; everything else separates words. Falls back to `_` / a leading `_`.
 */
export const tableStructName = (name: string): string => {
  const words = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  const base = words.join('') || '_';
  return IDENTIFIER_RE.test(base) ? base : `_${base}`;
};

const optionalOf = (info: TVariableInfo): TVariableInfo => ({ ...info, optional: true });

/** Value type of one table field as the editor sees it (a `select` is a plain string). */
export const tableFieldVariableInfo = (field: ITableField): TVariableInfo => {
  switch (field.type) {
    case 'number': {
      return { type: 'number', numberType: { type: 'any' } };
    }
    case 'boolean': {
      return { type: 'boolean' };
    }
    case 'json': {
      return { type: 'any' };
    }
    case 'file': {
      return { type: 'struct', id: FILE_TYPE_ID };
    }
    default: {
      // text, select, date, datetime
      return { type: 'string' };
    }
  }
};

/** Which static sql-common filter struct a field's `where` entry may use (`T | Filter<T>`). */
export const tableFilterTypeId = (field: ITableField): string => {
  switch (field.type) {
    case 'number': {
      return NUMBER_FILTER_TYPE_ID;
    }
    case 'boolean': {
      return BOOLEAN_FILTER_TYPE_ID;
    }
    case 'json':
    case 'file': {
      return ANY_FILTER_TYPE_ID;
    }
    default: {
      return STRING_FILTER_TYPE_ID;
    }
  }
};

const SYSTEM_ROW_PROPS: Record<string, TVariableInfo> = {
  id: { type: 'string' },
  version: { type: 'number', numberType: { type: 'any' } },
  createdAt: { type: 'string' },
  updatedAt: { type: 'string' },
};

/**
 * The five per-table structs (ADR 0075 (private) §4): `Row` (system keys + every field by NAME, optional
 * unless required), `Insert` (fields only), `Patch` (all optional), `Where` (per field `T | Filter<T>`,
 * the system keys, `and`/`or` nesting) and `#event` (the trigger scope). Pure and browser-safe.
 */
export const tableStructTypes = (doc: ITableDocumentLike): IIntegrationStructType[] => {
  const rowId = tableRowStructId(doc.id);
  const insertId = tableInsertStructId(doc.id);
  const patchId = tablePatchStructId(doc.id);
  const whereId = tableWhereStructId(doc.id);
  const eventId = tableEventStructId(doc.id);
  const name = tableStructName(doc.name);

  const rowProps: Record<string, TVariableInfo> = { ...SYSTEM_ROW_PROPS };
  const insertProps: Record<string, TVariableInfo> = {};
  const patchProps: Record<string, TVariableInfo> = {};
  const whereProps: Record<string, TVariableInfo> = {
    id: optionalOf({
      type: 'union',
      unionTypes: [{ type: 'string' }, { type: 'struct', id: STRING_FILTER_TYPE_ID }],
    }),
    version: optionalOf({
      type: 'union',
      unionTypes: [SYSTEM_ROW_PROPS.version, { type: 'struct', id: NUMBER_FILTER_TYPE_ID }],
    }),
    createdAt: optionalOf({
      type: 'union',
      unionTypes: [{ type: 'string' }, { type: 'struct', id: STRING_FILTER_TYPE_ID }],
    }),
    updatedAt: optionalOf({
      type: 'union',
      unionTypes: [{ type: 'string' }, { type: 'struct', id: STRING_FILTER_TYPE_ID }],
    }),
  };

  for (const field of doc.data.fields) {
    const value = tableFieldVariableInfo(field);
    rowProps[field.name] = field.required ? value : optionalOf(value);
    insertProps[field.name] = field.required && !hasTableFieldDefault(field) ? value : optionalOf(value);
    patchProps[field.name] = optionalOf(value);
    whereProps[field.name] = optionalOf({
      type: 'union',
      unionTypes: [value, { type: 'struct', id: tableFilterTypeId(field) }],
    });
  }
  whereProps.and = optionalOf({ type: 'array', elementType: { type: 'struct', id: whereId }, dimensions: 1 });
  whereProps.or = optionalOf({ type: 'array', elementType: { type: 'struct', id: whereId }, dimensions: 1 });

  const eventProps: Record<string, TVariableInfo> = {
    table: { type: 'string' },
    record: { type: 'struct', id: rowId },
    previous: optionalOf({ type: 'struct', id: rowId }),
    changedFields: optionalOf({ type: 'array', elementType: { type: 'string' }, dimensions: 1 }),
    source: { type: 'string' },
  };

  return [
    { id: rowId, name, properties: rowProps },
    { id: insertId, name: `${name}Insert`, properties: insertProps },
    { id: patchId, name: `${name}Patch`, properties: patchProps },
    { id: whereId, name: `${name}Where`, properties: whereProps },
    { id: eventId, name: `${name}Event`, properties: eventProps },
  ];
};
