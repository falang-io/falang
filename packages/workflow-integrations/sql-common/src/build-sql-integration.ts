import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor, IActivityOptions, IFieldSelectOption } from '@falang/workflow-integrations-common';
import { tableInsertStructId, tablePatchStructId, tableStructId, tableWhereStructId } from './struct-ids.js';
import type { ISyncedSchema, TSqlDialectName } from './schema-types.js';

/** Shared by every action's `new-variable` result field. */
const RESULT_VARIABLE_FIELD_NAME = 'resultVariable';

const anyType: TVariableInfo = { type: 'any' };
const anyArrayType: TVariableInfo = { type: 'array', elementType: anyType, dimensions: 1 };
const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

/** ADR 0039 (private) §7: one "regular" (task-queue-routed) activity per action, 60s timeout, Temporal's default retry policy (writes included — see that section for why). */
const SQL_ACTIVITY_OPTIONS: IActivityOptions = { kind: 'regular', startToCloseTimeout: '60 seconds' };

const hasTableFields = (fields: Readonly<Record<string, string>>): boolean =>
  Boolean(fields.credentialId && fields.table);

const rowType = (fields: Readonly<Record<string, string>>): TVariableInfo | undefined => {
  if (!hasTableFields(fields)) return;
  return { type: 'struct', id: tableStructId(fields.credentialId, null, fields.table) };
};

const rowArrayType = (fields: Readonly<Record<string, string>>): TVariableInfo | undefined => {
  const row = rowType(fields);
  if (!row) return;
  return { type: 'array', elementType: row, dimensions: 1 };
};

const insertType = (fields: Readonly<Record<string, string>>): TVariableInfo | undefined => {
  if (!hasTableFields(fields)) return;
  return { type: 'struct', id: tableInsertStructId(fields.credentialId, null, fields.table) };
};

const patchType = (fields: Readonly<Record<string, string>>): TVariableInfo | undefined => {
  if (!hasTableFields(fields)) return;
  return { type: 'struct', id: tablePatchStructId(fields.credentialId, null, fields.table) };
};

const whereType = (fields: Readonly<Record<string, string>>): TVariableInfo | undefined => {
  if (!hasTableFields(fields)) return;
  return { type: 'struct', id: tableWhereStructId(fields.credentialId, null, fields.table) };
};

/** `*-query`'s `result` field (`kind: 'result-type'`) is a JSON-encoded `TVariableInfo`, same convention `call-ai-text`'s own `result` field uses — absent/unparseable falls back to `any[]`. */
const queryResultType = (fields: Readonly<Record<string, string>>): TVariableInfo => {
  if (!fields.result) return anyArrayType;
  try {
    return JSON.parse(fields.result) as TVariableInfo;
  } catch {
    return anyArrayType;
  }
};

const emitAssign = (call: string, resultVariable: string): string =>
  resultVariable ? `const ${resultVariable} = ${call};` : `${call};`;

/** `*-update`/`*-delete`'s `where` — "required non-empty" per ADR 0039 (private) §6 ("a blank where is a compile-time error, not 'update everything'"). Caught here at edit time where the editor wires `IFieldConfig.validate`; `buildUpdate`/`buildDelete` (`query-builder.ts`) throw the same rule again at compile/runtime as a hard backstop. */
const requireNonBlankWhere = (value: string): string | undefined => {
  if (value.trim()) return;
  return 'sql:field.whereRequired';
};

/** `table`'s `loadOptions` (ADR 0039 (private) §6's extension): reads the synced schema (`ctx.vendorData.schema`, an `ISyncedSchema`) rather than a live round trip — `[]` before "Sync structure" has ever run. */
const loadTableOptions = (
  _fields: Readonly<Record<string, string>>,
  ctx?: { readonly vendorData: Readonly<Record<string, Record<string, unknown>>> },
): Promise<readonly IFieldSelectOption[]> => {
  const schema = ctx?.vendorData.schema as ISyncedSchema | undefined;
  if (!schema) return Promise.resolve([]);
  return Promise.resolve(
    schema.tables.map((table) => {
      const value = table.schema ? `${table.schema}.${table.name}` : table.name;
      return { value, label: value };
    }),
  );
};

/**
 * The six structured-CRUD-plus-raw-SQL node kinds every SQL dialect package shares — ADR 0039 (private)
 * §6. `opts.vendor` is the credential vendor id (restricts `credentialId`'s `credential-ref` field and
 * feeds `resolveSqlCredentialField`); `opts.activityPrefix` must match `buildSqlSharedActivityCode`'s
 * own generated function names (`${activityPrefix}Select`, etc.) — by convention this repo's three
 * dialect packages pass the dialect name itself for both.
 */
export const buildSqlActions = (
  // Not read today — kept for signature parity with `buildSqlSharedActivityCode(dialectName)` and as
  // the seam a future dialect-specific field/validation difference would hang off, without changing
  // every call site's shape again.
  _dialectName: TSqlDialectName,
  opts: { readonly vendor: string; readonly activityPrefix: string },
): IActionDescriptor[] => {
  const { vendor, activityPrefix } = opts;
  const p = activityPrefix;

  const credentialField = {
    name: 'credentialId',
    label: 'sql:field.credentialId',
    kind: 'credential-ref',
    vendor,
  } as const;
  const tableField = {
    name: 'table',
    label: 'sql:field.table',
    kind: 'select',
    options: [],
    loadOptions: loadTableOptions,
  } as const;
  const resultVariableField = {
    name: RESULT_VARIABLE_FIELD_NAME,
    label: 'sql:field.resultVariable',
    kind: 'new-variable',
  } as const;

  return [
    {
      name: `${vendor}-select`,
      label: 'sql:action.select',
      editorType: 'sidebar',
      fields: [
        credentialField,
        tableField,
        { name: 'where', label: 'sql:field.where', kind: 'expression', expectedType: whereType },
        { name: 'orderBy', label: 'sql:field.orderBy', kind: 'text' },
        { name: 'limit', label: 'sql:field.limit', kind: 'text' },
        resultVariableField,
      ],
      emit: (fields) => {
        // `orderBy`/`limit` are `kind: 'text'`, so `resolveFieldExpression` (`@falang/workflow-compiler`)
        // always `JSON.stringify`s them into a quoted string literal — never empty/falsy source text,
        // unlike an `'expression'` field left unedited. `limit` is deliberately typed `string` here (not
        // `number`) for exactly that reason: the compiled call site can only ever hand the activity a
        // string, so the activity itself (`buildSqlSharedActivityCode`) parses it to a number.
        const call = `await ${p}Select(${fields.credentialId}, ${fields.table}, ${fields.where || 'undefined'}, ${fields.orderBy}, ${fields.limit})`;
        return emitAssign(call, fields[RESULT_VARIABLE_FIELD_NAME]);
      },
      activitySignature: `${p}Select(credentialId: string, table: string, where: unknown, orderBy: string, limit: string): Promise<unknown[]>`,
      // Empty on purpose — the real function lives in `buildSqlSharedActivityCode`'s shared code
      // block, not per-action (see that module's own doc comment; same shape this repo already uses
      // for e.g. `choice-emitters.ts`'s activity descriptors).
      activityCode: '',
      activityOptions: SQL_ACTIVITY_OPTIONS,
      resultType: rowArrayType,
    },
    {
      name: `${vendor}-select-one`,
      label: 'sql:action.selectOne',
      editorType: 'sidebar',
      fields: [
        credentialField,
        tableField,
        { name: 'where', label: 'sql:field.where', kind: 'expression', expectedType: whereType },
        resultVariableField,
      ],
      emit: (fields) => {
        const call = `await ${p}SelectOne(${fields.credentialId}, ${fields.table}, ${fields.where || 'undefined'})`;
        return emitAssign(call, fields[RESULT_VARIABLE_FIELD_NAME]);
      },
      activitySignature: `${p}SelectOne(credentialId: string, table: string, where: unknown): Promise<unknown>`,
      activityCode: '',
      activityOptions: SQL_ACTIVITY_OPTIONS,
      resultType: rowType,
    },
    {
      name: `${vendor}-insert`,
      label: 'sql:action.insert',
      editorType: 'sidebar',
      fields: [
        credentialField,
        tableField,
        { name: 'row', label: 'sql:field.row', kind: 'expression', expectedType: insertType },
        resultVariableField,
      ],
      emit: (fields) =>
        emitAssign(
          `await ${p}Insert(${fields.credentialId}, ${fields.table}, ${fields.row || '{}'})`,
          fields[RESULT_VARIABLE_FIELD_NAME],
        ),
      activitySignature: `${p}Insert(credentialId: string, table: string, row: unknown): Promise<unknown>`,
      activityCode: '',
      activityOptions: SQL_ACTIVITY_OPTIONS,
      resultType: rowType,
    },
    {
      name: `${vendor}-update`,
      label: 'sql:action.update',
      editorType: 'sidebar',
      fields: [
        credentialField,
        tableField,
        { name: 'set', label: 'sql:field.set', kind: 'expression', expectedType: patchType },
        {
          name: 'where',
          label: 'sql:field.where',
          kind: 'expression',
          expectedType: whereType,
          validate: requireNonBlankWhere,
        },
        resultVariableField,
      ],
      emit: (fields) =>
        emitAssign(
          `await ${p}Update(${fields.credentialId}, ${fields.table}, ${fields.set || '{}'}, ${fields.where || 'undefined'})`,
          fields[RESULT_VARIABLE_FIELD_NAME],
        ),
      activitySignature: `${p}Update(credentialId: string, table: string, set: unknown, where: unknown): Promise<number>`,
      activityCode: '',
      activityOptions: SQL_ACTIVITY_OPTIONS,
      resultType: int32Type,
    },
    {
      name: `${vendor}-delete`,
      label: 'sql:action.delete',
      editorType: 'sidebar',
      fields: [
        credentialField,
        tableField,
        {
          name: 'where',
          label: 'sql:field.where',
          kind: 'expression',
          expectedType: whereType,
          validate: requireNonBlankWhere,
        },
        resultVariableField,
      ],
      emit: (fields) =>
        emitAssign(
          `await ${p}Delete(${fields.credentialId}, ${fields.table}, ${fields.where || 'undefined'})`,
          fields[RESULT_VARIABLE_FIELD_NAME],
        ),
      activitySignature: `${p}Delete(credentialId: string, table: string, where: unknown): Promise<number>`,
      activityCode: '',
      activityOptions: SQL_ACTIVITY_OPTIONS,
      resultType: int32Type,
    },
    {
      name: `${vendor}-query`,
      label: 'sql:action.query',
      editorType: 'sidebar',
      fields: [
        credentialField,
        // Plain text, deliberately not `template-string` — `${}` interpolation in raw SQL is exactly
        // the injection shape this action must not offer (ADR 0039 (private) §6).
        { name: 'sql', label: 'sql:field.sql', kind: 'text' },
        { name: 'params', label: 'sql:field.params', kind: 'expression', expectedType: anyArrayType },
        { name: 'result', label: 'sql:field.result', kind: 'result-type' },
        resultVariableField,
      ],
      emit: (fields) =>
        emitAssign(
          `await ${p}Query(${fields.credentialId}, ${fields.sql}, ${fields.params || '[]'})`,
          fields[RESULT_VARIABLE_FIELD_NAME],
        ),
      activitySignature: `${p}Query(credentialId: string, sql: string, params: unknown[]): Promise<unknown[]>`,
      activityCode: '',
      activityOptions: SQL_ACTIVITY_OPTIONS,
      resultType: queryResultType,
    },
  ];
};
