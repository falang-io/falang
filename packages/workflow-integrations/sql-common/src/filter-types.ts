import type { TVariableInfo } from '@falang/typescript-dto';
import type { IIntegrationStructType } from '@falang/workflow-integrations-common';
import {
  structName,
  tableInsertStructId,
  tablePatchStructId,
  tableStructId,
  tableWhereStructId,
} from './struct-ids.js';
import type { ISyncedTable, TSqlDialectName } from './schema-types.js';
import { sqlTypeToVariableInfo } from './sql-type-mapping.js';

/** Static vendor struct types for `where`'s per-column operator DSL — ADR 0039 (private) §5. */
export const NUMBER_FILTER_TYPE_ID = 'sql/NumberFilter';
export const STRING_FILTER_TYPE_ID = 'sql/StringFilter';
export const BOOLEAN_FILTER_TYPE_ID = 'sql/BooleanFilter';
export const ANY_FILTER_TYPE_ID = 'sql/AnyFilter';

const optionalOf = (info: TVariableInfo): TVariableInfo => ({ ...info, optional: true });

const buildComparisonFields = (scalar: TVariableInfo): Record<string, TVariableInfo> => ({
  eq: optionalOf(scalar),
  ne: optionalOf(scalar),
  gt: optionalOf(scalar),
  gte: optionalOf(scalar),
  lt: optionalOf(scalar),
  lte: optionalOf(scalar),
  in: optionalOf({ type: 'array', elementType: scalar, dimensions: 1 }),
  notIn: optionalOf({ type: 'array', elementType: scalar, dimensions: 1 }),
  isNull: optionalOf({ type: 'boolean' }),
});

export const sqlNumberFilterType: IIntegrationStructType = {
  id: NUMBER_FILTER_TYPE_ID,
  name: 'NumberFilter',
  properties: buildComparisonFields({ type: 'number', numberType: { type: 'any' } }),
};

export const sqlStringFilterType: IIntegrationStructType = {
  id: STRING_FILTER_TYPE_ID,
  name: 'StringFilter',
  properties: {
    ...buildComparisonFields({ type: 'string' }),
    like: optionalOf({ type: 'string' }),
    ilike: optionalOf({ type: 'string' }),
    startsWith: optionalOf({ type: 'string' }),
    contains: optionalOf({ type: 'string' }),
  },
};

export const sqlBooleanFilterType: IIntegrationStructType = {
  id: BOOLEAN_FILTER_TYPE_ID,
  name: 'BooleanFilter',
  properties: {
    eq: optionalOf({ type: 'boolean' }),
    ne: optionalOf({ type: 'boolean' }),
    isNull: optionalOf({ type: 'boolean' }),
  },
};

export const sqlAnyFilterType: IIntegrationStructType = {
  id: ANY_FILTER_TYPE_ID,
  name: 'AnyFilter',
  properties: {
    eq: optionalOf({ type: 'any' }),
    isNull: optionalOf({ type: 'boolean' }),
  },
};

export const sqlFilterStructTypes: readonly IIntegrationStructType[] = [
  sqlNumberFilterType,
  sqlStringFilterType,
  sqlBooleanFilterType,
  sqlAnyFilterType,
];

/** Which of the four static filter structs a column's own mapped type should offer in `Where`. */
export const filterTypeIdFor = (variableInfo: TVariableInfo): string => {
  switch (variableInfo.type) {
    case 'number': {
      return NUMBER_FILTER_TYPE_ID;
    }
    case 'string': {
      return STRING_FILTER_TYPE_ID;
    }
    case 'boolean': {
      return BOOLEAN_FILTER_TYPE_ID;
    }
    default: {
      return ANY_FILTER_TYPE_ID;
    }
  }
};

/**
 * The four per-table structs — `Row` (every column), `Insert` (`hasDefault || nullable` columns
 * optional), `Patch` (every column optional), `Where` (the operator DSL: every column optional,
 * typed `T | Filter<T>`, plus `and`/`or` nesting) — ADR 0039 (private) §5.
 */
export const buildTableStructTypes = (
  instanceId: string,
  instanceName: string,
  table: ISyncedTable,
  dialect: TSqlDialectName,
): IIntegrationStructType[] => {
  const rowId = tableStructId(instanceId, table.schema, table.name);
  const insertId = tableInsertStructId(instanceId, table.schema, table.name);
  const patchId = tablePatchStructId(instanceId, table.schema, table.name);
  const whereId = tableWhereStructId(instanceId, table.schema, table.name);
  const name = structName(instanceName, table.name);

  const rowProps: Record<string, TVariableInfo> = {};
  const insertProps: Record<string, TVariableInfo> = {};
  const patchProps: Record<string, TVariableInfo> = {};
  const whereProps: Record<string, TVariableInfo> = {};

  for (const column of table.columns) {
    const columnType = sqlTypeToVariableInfo(column, dialect);
    rowProps[column.name] = columnType;
    insertProps[column.name] = column.hasDefault || column.nullable ? optionalOf(columnType) : columnType;
    patchProps[column.name] = optionalOf(columnType);
    whereProps[column.name] = optionalOf({
      type: 'union',
      unionTypes: [columnType, { type: 'struct', id: filterTypeIdFor(columnType) }],
    });
  }

  whereProps.and = optionalOf({ type: 'array', elementType: { type: 'struct', id: whereId }, dimensions: 1 });
  whereProps.or = optionalOf({ type: 'array', elementType: { type: 'struct', id: whereId }, dimensions: 1 });

  return [
    { id: rowId, name, properties: rowProps },
    { id: insertId, name: `${name}Insert`, properties: insertProps },
    { id: patchId, name: `${name}Patch`, properties: patchProps },
    { id: whereId, name: `${name}Where`, properties: whereProps },
  ];
};
