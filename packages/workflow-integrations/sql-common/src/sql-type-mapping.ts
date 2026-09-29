import type { TVariableInfo } from '@falang/typescript-dto';
import type { ISyncedColumn, TSqlDialectName } from './schema-types.js';

interface IParsedSqlType {
  readonly base: string;
  readonly args: readonly string[];
}

/** `"character varying(255)"` -> `{ base: "character varying", args: ["255"] }`, case/whitespace-insensitive. */
const parseSqlType = (sqlType: string): IParsedSqlType => {
  const trimmed = sqlType.trim().toLowerCase().replaceAll(/\s+/g, ' ');
  const match = /^([a-z_ ]+?)\s*(?:\(([^)]*)\))?$/.exec(trimmed);
  if (!match) return { base: trimmed, args: [] };
  const [, rawBase, rawArgs] = match;
  const args = rawArgs ? rawArgs.split(',').map((part) => part.trim()) : [];
  return { base: rawBase.trim(), args };
};

const INT32_BASE_NAMES = new Set([
  'smallint',
  'int2',
  'integer',
  'int',
  'int4',
  'mediumint',
  'smallserial',
  'serial',
  'serial4',
  'tinyint',
]);
const INT64_BASE_NAMES = new Set(['bigint', 'int8', 'bigserial', 'serial8']);
/** All uniformly `float64` per the ADR (§5) — only `numeric(p, s)`/`decimal(p, s)` with explicit precision get `decimal`. */
const FLOAT64_BASE_NAMES = new Set(['real', 'float', 'float4', 'float8', 'double', 'double precision']);
const DECIMAL_BASE_NAMES = new Set(['numeric', 'decimal']);
const STRING_BASE_NAMES = new Set([
  'text',
  'varchar',
  'character varying',
  'character',
  'char',
  'bpchar',
  'uuid',
  'date',
  'time',
  'time without time zone',
  'time with time zone',
  'timetz',
  'timestamp',
  'timestamp without time zone',
  'timestamp with time zone',
  'timestamptz',
  'datetime',
  'interval',
  'inet',
  'cidr',
  'macaddr',
  'xml',
  'money',
  'tinytext',
  'mediumtext',
  'longtext',
  'nchar',
  'nvarchar',
  'ntext',
  'enum',
  'set',
]);
const JSON_BASE_NAMES = new Set(['json', 'jsonb']);
const BOOLEAN_BASE_NAMES = new Set(['boolean', 'bool']);

const isMysqlBooleanTinyint = (dialect: TSqlDialectName, base: string, args: readonly string[]): boolean =>
  dialect === 'mysql' && base === 'tinyint' && args[0] === '1';

const isBitBoolean = (base: string, args: readonly string[]): boolean => base === 'bit' && args[0] === '1';

const mapScalarBase = (base: string, args: readonly string[], dialect: TSqlDialectName): TVariableInfo => {
  if (BOOLEAN_BASE_NAMES.has(base) || isBitBoolean(base, args) || isMysqlBooleanTinyint(dialect, base, args)) {
    return { type: 'boolean' };
  }

  // SQLite's INTEGER affinity is a dynamically-typed 8-byte signed integer — unlike every other
  // dialect's plain `integer`/`int` (32-bit) — so it maps to int64 here specifically.
  if (dialect === 'sqlite' && base === 'integer') {
    return { type: 'number', numberType: { type: 'integer', integerType: 'int64' } };
  }
  if (INT32_BASE_NAMES.has(base)) return { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
  if (INT64_BASE_NAMES.has(base)) return { type: 'number', numberType: { type: 'integer', integerType: 'int64' } };

  if (DECIMAL_BASE_NAMES.has(base)) {
    if (args.length === 2 && args.every((part) => /^\d+$/.test(part))) {
      return { type: 'number', numberType: { type: 'decimal', digits: Number(args[0]), decimals: Number(args[1]) } };
    }
    return { type: 'number', numberType: { type: 'float', floatType: 'float64' } };
  }
  if (FLOAT64_BASE_NAMES.has(base)) return { type: 'number', numberType: { type: 'float', floatType: 'float64' } };

  // SQLite's NUMERIC affinity covers declared types with no exact match above (e.g. a bespoke
  // `DECIMAL`-ish alias) — treated the same as Postgres/MySQL's own `numeric` (float64, no precision).
  if (dialect === 'sqlite' && base === 'numeric')
    return { type: 'number', numberType: { type: 'float', floatType: 'float64' } };

  if (STRING_BASE_NAMES.has(base)) return { type: 'string' };
  if (JSON_BASE_NAMES.has(base)) return { type: 'any' };

  return { type: 'any' };
};

const stripOptional = (info: TVariableInfo): TVariableInfo => {
  const { optional: _optional, ...rest } = info;
  return rest as TVariableInfo;
};

/**
 * Maps one synced column to its editor-facing `TVariableInfo` — see ADR 0039 (private) §5's mapping
 * table. `column.enumValues` (Postgres native enums) always degrade to `string` (honest: a
 * `TVariableInfo` `enum` variant points at a project enum-structure document, not a vendor list).
 * `column.isArray` (Postgres arrays) wraps the *non-array* mapping of the same `sqlType` in one level
 * of `{ type: 'array', dimensions: 1 }`.
 */
export const sqlTypeToVariableInfo = (column: ISyncedColumn, dialect: TSqlDialectName): TVariableInfo => {
  const optional = column.nullable ? { optional: true as const } : {};

  if (column.enumValues && column.enumValues.length > 0) {
    return { type: 'string', ...optional };
  }

  const { base, args } = parseSqlType(column.sqlType);
  const scalar = mapScalarBase(base, args, dialect);

  if (column.isArray) {
    return { type: 'array', elementType: stripOptional(scalar), dimensions: 1, ...optional };
  }

  return { ...scalar, ...optional };
};
