import type { TSqlDialectName } from './schema-types.js';

/** One dialect's identifier-quoting/parameter-placeholder/`RETURNING`-support rules — see `dialects.ts`. */
export interface ISqlDialect {
  readonly name: TSqlDialectName;
  quoteIdent(name: string): string;
  placeholder(index: number): string;
  readonly supportsReturning: boolean;
}

export interface IBuiltQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** A single column's filter object — every key is optional, all present keys are ANDed. */
export interface IColumnFilter {
  readonly eq?: unknown;
  readonly ne?: unknown;
  readonly gt?: unknown;
  readonly gte?: unknown;
  readonly lt?: unknown;
  readonly lte?: unknown;
  readonly in?: readonly unknown[];
  readonly notIn?: readonly unknown[];
  readonly isNull?: boolean;
  readonly like?: string;
  readonly ilike?: string;
  readonly startsWith?: string;
  readonly contains?: string;
}

/**
 * The operator DSL a `*-select`/`*-update`/`*-delete` action's `where` field compiles to — ADR 0039 (private)
 * §5/§6. A bare (non-object, non-`and`/`or`) value means `eq` (`null` -> `IS NULL`); `and`/`or` nest.
 */
export type TWhere = {
  readonly and?: readonly TWhere[];
  readonly or?: readonly TWhere[];
} & Record<string, unknown>;

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Guards every identifier that reaches SQL text from a caller-supplied object key (a `where`/`row`/`set` key, a table/orderBy column name) — never string-concatenated unchecked. */
export const validateIdentifier = (name: string): string => {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`sql-common: invalid SQL identifier "${name}"`);
  }
  return name;
};

/**
 * `table` is what `build-sql-integration.ts`'s `table` field's `loadOptions` actually hands back for a
 * schema-qualified table — a single `"<schema>.<table>"` string (see that module's `loadTableOptions`),
 * not a separate `schema` option (nothing populates `I*Options.schema` today; it stays for a future
 * caller that already knows the two parts apart). Splitting on `.` here — rather than validating the
 * whole string as one identifier — is what makes a real `"public.orders"` value quote correctly instead
 * of tripping `validateIdentifier`'s no-dot regex. At most two parts (`schema.table`); a bare, unqualified
 * table name is the one-part case. Each part is validated/quoted independently so neither can smuggle in
 * a quote-escape or extra dot.
 */
const quoteTable = (table: string, schema: string | null | undefined, dialect: ISqlDialect): string => {
  const parts = schema ? [schema, table] : table.split('.');
  if (parts.length === 0 || parts.length > 2 || parts.some((part) => part.length === 0)) {
    throw new Error(`sql-common: invalid SQL identifier "${table}"`);
  }
  return parts.map((part) => dialect.quoteIdent(validateIdentifier(part))).join('.');
};

/** `%`/`_` are LIKE wildcards, `\` is the escape char — all three get backslash-escaped so `startsWith`/`contains` treat their value as a literal substring, not a pattern. Paired with an explicit `ESCAPE '\'` clause (portable across Postgres/MySQL/SQLite). */
// These escapes are the actual point (one/two literal backslash characters, `\%`, `\_`); a raw
// template can't end in a lone backslash at all (it would escape the closing backtick), so plain
// string literals stay clearer and correct here.
const escapeLikePattern = (value: string): string =>
  // oxlint-disable-next-line unicorn/prefer-string-raw
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

const pushParam = (params: unknown[], value: unknown, dialect: ISqlDialect): string => {
  params.push(value);
  return dialect.placeholder(params.length);
};

const compileInList = (
  column: string,
  values: readonly unknown[],
  negate: boolean,
  params: unknown[],
  dialect: ISqlDialect,
): string => {
  if (values.length === 0) {
    // An empty `in` matches nothing; an empty `notIn` excludes nothing — both are dialect-neutral
    // boolean literals expressed as a comparison, not a driver-specific `TRUE`/`FALSE` keyword.
    return negate ? '1=1' : '1=0';
  }
  const placeholders = values.map((value) => pushParam(params, value, dialect));
  return `${column} ${negate ? 'NOT IN' : 'IN'} (${placeholders.join(', ')})`;
};

const compileLike = (
  column: string,
  pattern: string,
  params: unknown[],
  dialect: ISqlDialect,
  caseInsensitive: boolean,
): string => {
  const placeholder = pushParam(params, pattern, dialect);
  if (caseInsensitive && dialect.name === 'postgres') return `${column} ILIKE ${placeholder} ESCAPE '\\'`;
  if (caseInsensitive) return `LOWER(${column}) LIKE LOWER(${placeholder}) ESCAPE '\\'`;
  return `${column} LIKE ${placeholder} ESCAPE '\\'`;
};

const compileOperator = (
  column: string,
  operator: string,
  value: unknown,
  params: unknown[],
  dialect: ISqlDialect,
): string => {
  switch (operator) {
    case 'eq': {
      return value === null ? `${column} IS NULL` : `${column} = ${pushParam(params, value, dialect)}`;
    }
    case 'ne': {
      return value === null ? `${column} IS NOT NULL` : `${column} <> ${pushParam(params, value, dialect)}`;
    }
    case 'gt': {
      return `${column} > ${pushParam(params, value, dialect)}`;
    }
    case 'gte': {
      return `${column} >= ${pushParam(params, value, dialect)}`;
    }
    case 'lt': {
      return `${column} < ${pushParam(params, value, dialect)}`;
    }
    case 'lte': {
      return `${column} <= ${pushParam(params, value, dialect)}`;
    }
    case 'in': {
      return compileInList(column, value as readonly unknown[], false, params, dialect);
    }
    case 'notIn': {
      return compileInList(column, value as readonly unknown[], true, params, dialect);
    }
    case 'isNull': {
      return value ? `${column} IS NULL` : `${column} IS NOT NULL`;
    }
    case 'like': {
      return compileLike(column, value as string, params, dialect, false);
    }
    case 'ilike': {
      return compileLike(column, value as string, params, dialect, true);
    }
    case 'startsWith': {
      return compileLike(column, `${escapeLikePattern(value as string)}%`, params, dialect, false);
    }
    case 'contains': {
      return compileLike(column, `%${escapeLikePattern(value as string)}%`, params, dialect, false);
    }
    default: {
      throw new Error(`sql-common: unknown filter operator "${operator}"`);
    }
  }
};

const compileColumnFilter = (column: string, value: unknown, params: unknown[], dialect: ISqlDialect): string => {
  if (value === null) return `${column} IS NULL`;
  if (typeof value !== 'object' || Array.isArray(value)) {
    return `${column} = ${pushParam(params, value, dialect)}`;
  }
  // `no-undefined` vs `no-typeof-undefined` disagree on this exact case (see
  // `compile-ts-project.typecheck.test.ts`'s own disable comment for the same tension).
  // oxlint-disable-next-line no-undefined
  const entries = Object.entries(value as IColumnFilter).filter(([, opValue]) => opValue !== undefined);
  if (entries.length === 0) {
    throw new Error(`sql-common: empty filter object for column "${column}"`);
  }
  const clauses = entries.map(([operator, opValue]) => compileOperator(column, operator, opValue, params, dialect));
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(' AND ')})`;
};

/** Compiles a `TWhere` into a SQL boolean expression (no leading `WHERE`), pushing bind values onto `params` in emission order. `undefined`/`{}` compiles to `''` (no filter). */
export const compileWhere = (where: TWhere | undefined | null, dialect: ISqlDialect, params: unknown[]): string => {
  if (!where) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(where)) {
    // oxlint-disable-next-line no-undefined -- see the same tension noted at `compileColumnFilter`'s filter above.
    if (value === undefined) continue;
    if (key === 'and' || key === 'or') {
      const clauses = (value as readonly TWhere[])
        .map((sub) => compileWhere(sub, dialect, params))
        .filter((clause) => clause.length > 0);
      if (clauses.length === 0) continue;
      parts.push(`(${clauses.join(key === 'and' ? ' AND ' : ' OR ')})`);
      continue;
    }
    const column = dialect.quoteIdent(validateIdentifier(key));
    parts.push(compileColumnFilter(column, value, params, dialect));
  }
  return parts.join(' AND ');
};

const ORDER_BY_CLAUSE_RE = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(asc|desc))?$/i;

const buildOrderBy = (orderBy: string, dialect: ISqlDialect): string =>
  orderBy
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      const match = ORDER_BY_CLAUSE_RE.exec(trimmed);
      if (!match) throw new Error(`sql-common: invalid orderBy clause "${trimmed}"`);
      const [, column, direction] = match;
      return `${dialect.quoteIdent(column)}${direction ? ` ${direction.toUpperCase()}` : ''}`;
    })
    .join(', ');

export interface ISelectOptions {
  readonly table: string;
  readonly schema?: string | null;
  readonly where?: TWhere;
  readonly orderBy?: string;
  readonly limit?: number;
}

export const buildSelect = (opts: ISelectOptions, dialect: ISqlDialect): IBuiltQuery => {
  const params: unknown[] = [];
  const whereSql = compileWhere(opts.where, dialect, params);
  let sql = `SELECT * FROM ${quoteTable(opts.table, opts.schema, dialect)}`;
  if (whereSql) sql += ` WHERE ${whereSql}`;
  if (opts.orderBy) sql += ` ORDER BY ${buildOrderBy(opts.orderBy, dialect)}`;
  if (typeof opts.limit === 'number' && Number.isFinite(opts.limit) && opts.limit > 0) {
    sql += ` LIMIT ${Math.trunc(opts.limit)}`;
  }
  return { sql, params };
};

export interface IInsertOptions {
  readonly table: string;
  readonly schema?: string | null;
  readonly row: Readonly<Record<string, unknown>>;
}

export const buildInsert = (opts: IInsertOptions, dialect: ISqlDialect): IBuiltQuery => {
  // oxlint-disable-next-line no-undefined -- see the same tension noted at `compileColumnFilter`'s filter above.
  const entries = Object.entries(opts.row).filter(([, value]) => value !== undefined);
  if (entries.length === 0) throw new Error('sql-common: insert requires at least one column');
  const params: unknown[] = [];
  const columns = entries.map(([key]) => dialect.quoteIdent(validateIdentifier(key)));
  const placeholders = entries.map(([, value]) => pushParam(params, value, dialect));
  let sql = `INSERT INTO ${quoteTable(opts.table, opts.schema, dialect)} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  if (dialect.supportsReturning) sql += ' RETURNING *';
  return { sql, params };
};

export interface IUpdateOptions {
  readonly table: string;
  readonly schema?: string | null;
  readonly set: Readonly<Record<string, unknown>>;
  readonly where: TWhere;
}

export const buildUpdate = (opts: IUpdateOptions, dialect: ISqlDialect): IBuiltQuery => {
  // oxlint-disable-next-line no-undefined -- see the same tension noted at `compileColumnFilter`'s filter above.
  const setEntries = Object.entries(opts.set).filter(([, value]) => value !== undefined);
  if (setEntries.length === 0) throw new Error('sql-common: update requires at least one column in "set"');
  const params: unknown[] = [];
  const setSql = setEntries
    .map(([key, value]) => `${dialect.quoteIdent(validateIdentifier(key))} = ${pushParam(params, value, dialect)}`)
    .join(', ');
  const whereSql = compileWhere(opts.where, dialect, params);
  if (!whereSql) throw new Error('sql-common: update requires a non-empty "where"');
  return { sql: `UPDATE ${quoteTable(opts.table, opts.schema, dialect)} SET ${setSql} WHERE ${whereSql}`, params };
};

export interface IDeleteOptions {
  readonly table: string;
  readonly schema?: string | null;
  readonly where: TWhere;
}

export const buildDelete = (opts: IDeleteOptions, dialect: ISqlDialect): IBuiltQuery => {
  const params: unknown[] = [];
  const whereSql = compileWhere(opts.where, dialect, params);
  if (!whereSql) throw new Error('sql-common: delete requires a non-empty "where"');
  return { sql: `DELETE FROM ${quoteTable(opts.table, opts.schema, dialect)} WHERE ${whereSql}`, params };
};
