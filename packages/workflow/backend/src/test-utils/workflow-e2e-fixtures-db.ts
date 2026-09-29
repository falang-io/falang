import type { INode } from '@falang/dto';

/**
 * `<vendor>-select`/`-select-one`/`-insert`/`-update`/`-delete`/`-query` node builders —
 * `@falang/workflow-integrations-sql-common`'s `build-sql-integration.ts` (`buildSqlActions`) is the
 * single source of these field names; every dialect package (postgres/mysql/sqlite) shares the same
 * shape, only the node-name prefix (`vendor`) differs. See ADR 0039 (private)
 * §5/§6. `where`/`row`/`set`/`params` are `kind: 'expression'` fields — raw TypeScript source text
 * (the operator DSL from that ADR's §5 is just an object literal, e.g. `'{ status: { in: ["new"] } }'`),
 * not a JSON value; `sql` is plain `kind: 'text'` (never interpolated). Split out from
 * `workflow-e2e-fixtures.ts` to stay under this repo's 300-line-per-file lint cap (see CLAUDE.md's
 * "Conventions").
 */
interface ISqlSelectFields {
  readonly credentialId: string;
  readonly table: string;
  readonly where?: string;
  readonly orderBy?: string;
  readonly limit?: string;
  readonly resultVariable: string;
}

/** `<vendor>-select` node. */
export const buildSqlSelectNode = (id: string, vendor: string, fields: ISqlSelectFields): INode => ({
  id,
  name: `${vendor}-select`,
  data: {
    credentialId: fields.credentialId,
    table: fields.table,
    where: fields.where ?? '',
    orderBy: fields.orderBy ?? '',
    limit: fields.limit ?? '',
    resultVariable: fields.resultVariable,
  },
});

interface ISqlSelectOneFields {
  readonly credentialId: string;
  readonly table: string;
  readonly where?: string;
  readonly resultVariable: string;
}

/** `<vendor>-select-one` node. */
export const buildSqlSelectOneNode = (id: string, vendor: string, fields: ISqlSelectOneFields): INode => ({
  id,
  name: `${vendor}-select-one`,
  data: {
    credentialId: fields.credentialId,
    table: fields.table,
    where: fields.where ?? '',
    resultVariable: fields.resultVariable,
  },
});

interface ISqlInsertFields {
  readonly credentialId: string;
  readonly table: string;
  /** Raw expression code, `expectedType: <Table>Insert` — e.g. `"{ status: 'new', total: 42.5 }"`. */
  readonly row: string;
  readonly resultVariable: string;
}

/** `<vendor>-insert` node. */
export const buildSqlInsertNode = (id: string, vendor: string, fields: ISqlInsertFields): INode => ({
  id,
  name: `${vendor}-insert`,
  data: {
    credentialId: fields.credentialId,
    table: fields.table,
    row: fields.row,
    resultVariable: fields.resultVariable,
  },
});

interface ISqlUpdateFields {
  readonly credentialId: string;
  readonly table: string;
  /** Raw expression code, `expectedType: <Table>Patch` — e.g. `"{ status: 'paid' }"`. */
  readonly set: string;
  /** Required non-empty (ADR 0039 (private) §6) — a blank `where` is a compile-time/runtime error. */
  readonly where: string;
  readonly resultVariable: string;
}

/** `<vendor>-update` node. */
export const buildSqlUpdateNode = (id: string, vendor: string, fields: ISqlUpdateFields): INode => ({
  id,
  name: `${vendor}-update`,
  data: {
    credentialId: fields.credentialId,
    table: fields.table,
    set: fields.set,
    where: fields.where,
    resultVariable: fields.resultVariable,
  },
});

interface ISqlDeleteFields {
  readonly credentialId: string;
  readonly table: string;
  /** Required non-empty, same rule as `ISqlUpdateFields.where`. */
  readonly where: string;
  readonly resultVariable: string;
}

/** `<vendor>-delete` node. */
export const buildSqlDeleteNode = (id: string, vendor: string, fields: ISqlDeleteFields): INode => ({
  id,
  name: `${vendor}-delete`,
  data: {
    credentialId: fields.credentialId,
    table: fields.table,
    where: fields.where,
    resultVariable: fields.resultVariable,
  },
});

interface ISqlQueryFields {
  readonly credentialId: string;
  /** Plain text, deliberately not template-string (ADR 0039 (private) §6) — e.g. `'SELECT 1'`. */
  readonly sql: string;
  /** Raw expression code, `expectedType: any[]` — e.g. `'["paid"]'`. */
  readonly params?: string;
  /** JSON-encoded `TVariableInfo`, same `result`/`result-type` convention as `call-ai-text`'s own `result` field. */
  readonly result?: string;
  readonly resultVariable: string;
}

/** `<vendor>-query` node. */
export const buildSqlQueryNode = (id: string, vendor: string, fields: ISqlQueryFields): INode => ({
  id,
  name: `${vendor}-query`,
  data: {
    credentialId: fields.credentialId,
    sql: fields.sql,
    params: fields.params ?? '[]',
    result: fields.result ?? '',
    resultVariable: fields.resultVariable,
  },
});
