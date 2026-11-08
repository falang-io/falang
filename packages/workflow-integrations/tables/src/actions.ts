// oxlint-disable no-undefined -- optional values are modelled with `undefined` throughout (absent filter/field).
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor, IActivityOptions, IFieldConfig } from '@falang/workflow-integrations-common';
import { buildOrderByAgentNotes, buildWhereAgentNotes } from '@falang/workflow-integrations-sql-common';
import {
  RESULT_VARIABLE_FIELD_NAME,
  TABLE_DELETE_ACTION_NAME,
  TABLE_FIELD_NAME,
  TABLE_GET_ACTION_NAME,
  TABLE_INSERT_ACTION_NAME,
  TABLE_SELECT_ACTION_NAME,
  TABLE_UPDATE_ACTION_NAME,
} from './constants.js';
import { tableInsertStructId, tablePatchStructId, tableRowStructId, tableWhereStructId } from './table-struct-ids.js';

/** `agentNotes` extras on top of sql-common's shared `where`/`orderBy` notes. */
const SYSTEM_FIELDS_NOTE = "Keys are the table's field names; id, version, createdAt and updatedAt are available too.";
const VERSION_NOTE =
  'Optimistic locking: `{ id: record.id, version: record.version }` matches only if nobody changed the record since it was read (0 rows otherwise).';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

/** One small internal-API round trip each — routed (`regular`) rather than local, 30 s, Temporal's default retry policy. */
const TABLE_ACTIVITY_OPTIONS: IActivityOptions = { kind: 'regular', startToCloseTimeout: '30 seconds' };

type TFields = Readonly<Record<string, string>>;

const structOf =
  (idOf: (docId: string) => string) =>
  (fields: TFields): TVariableInfo | undefined =>
    fields[TABLE_FIELD_NAME] ? { type: 'struct', id: idOf(fields[TABLE_FIELD_NAME]) } : undefined;

const rowType = structOf(tableRowStructId);
const insertType = structOf(tableInsertStructId);
const patchType = structOf(tablePatchStructId);
const whereType = structOf(tableWhereStructId);

const rowArrayType = (fields: TFields): TVariableInfo | undefined => {
  const row = rowType(fields);
  return row ? { type: 'array', elementType: row, dimensions: 1 } : undefined;
};

/** `update`/`delete` never run without a filter ("update everything" must be spelled out as an explicit condition). */
const requireNonBlankWhere = (value: string): string | undefined =>
  value.trim() ? undefined : 'tables:field.whereRequired';

const tableField: IFieldConfig = {
  name: TABLE_FIELD_NAME,
  label: 'tables:field.table',
  kind: 'document-ref',
  documentType: 'table',
};
const resultField: IFieldConfig = {
  name: RESULT_VARIABLE_FIELD_NAME,
  label: 'tables:field.result',
  kind: 'new-variable',
};

const emitAssign = (call: string, resultVariable: string): string =>
  resultVariable ? `const ${resultVariable} = ${call};` : `${call};`;

export const tablesActions: readonly IActionDescriptor[] = [
  {
    name: TABLE_SELECT_ACTION_NAME,
    label: 'tables:action.select',
    editorType: 'sidebar',
    fields: [
      tableField,
      {
        name: 'where',
        label: 'tables:field.where',
        help: 'tables:help.where',
        agentNotes: `${buildWhereAgentNotes('field', { required: false })} ${SYSTEM_FIELDS_NOTE}`,
        kind: 'expression',
        expectedType: whereType,
      },
      {
        name: 'orderBy',
        label: 'tables:field.orderBy',
        help: 'tables:help.orderBy',
        agentNotes: `${buildOrderByAgentNotes('field')} ${SYSTEM_FIELDS_NOTE}`,
        kind: 'text',
      },
      {
        name: 'limit',
        label: 'tables:field.limit',
        help: 'tables:help.limit',
        agentNotes: 'A whole number as plain text: 100 by default, at most 1000.',
        kind: 'text',
        defaultValue: '100',
      },
      {
        name: 'offset',
        label: 'tables:field.offset',
        help: 'tables:help.offset',
        agentNotes: 'How many leading records to skip (paging), a whole number as plain text, e.g. `0`, `100`.',
        kind: 'text',
        defaultValue: '0',
      },
      resultField,
    ],
    emit: (fields) =>
      emitAssign(
        `await tableSelect(${fields[TABLE_FIELD_NAME]}, ${fields.where || 'undefined'}, ${fields.orderBy}, ${fields.limit}, ${fields.offset})`,
        fields[RESULT_VARIABLE_FIELD_NAME],
      ),
    activitySignature:
      'tableSelect(tableId: string, where: unknown, orderBy: string, limit: string, offset: string): Promise<any[]>',
    activityCode: [
      'export const tableSelect = (',
      '  tableId: string,',
      '  where: unknown,',
      '  orderBy: string,',
      '  limit: string,',
      '  offset: string,',
      '): Promise<any[]> =>',
      '  tableGuard(() => tablesSelectRecords(tableId, tableFieldMapOf(tableId), { where, orderBy, limit, offset }));',
    ].join('\n'),
    activityOptions: TABLE_ACTIVITY_OPTIONS,
    resultType: rowArrayType,
  },
  {
    name: TABLE_GET_ACTION_NAME,
    label: 'tables:action.get',
    editorType: 'sidebar',
    fields: [
      tableField,
      {
        name: 'id',
        label: 'tables:field.id',
        help: 'tables:help.id',
        kind: 'expression',
        expectedType: { type: 'string' },
      },
      resultField,
    ],
    emit: (fields) =>
      emitAssign(
        `await tableGet(${fields[TABLE_FIELD_NAME]}, ${fields.id || "''"})`,
        fields[RESULT_VARIABLE_FIELD_NAME],
      ),
    activitySignature: 'tableGet(tableId: string, id: string): Promise<any>',
    activityCode: [
      'export const tableGet = (tableId: string, id: string): Promise<any> =>',
      '  tableGuard(() => tablesGetRecord(tableId, tableFieldMapOf(tableId), id));',
    ].join('\n'),
    activityOptions: TABLE_ACTIVITY_OPTIONS,
    resultType: rowType,
  },
  {
    name: TABLE_INSERT_ACTION_NAME,
    label: 'tables:action.insert',
    editorType: 'sidebar',
    fields: [
      tableField,
      {
        name: 'row',
        label: 'tables:field.row',
        help: 'tables:help.row',
        agentNotes:
          'An object literal: field name → value, e.g. `{ maxId: user.id, joined: true }`. Required fields must be set.',
        kind: 'expression',
        expectedType: insertType,
      },
      resultField,
    ],
    emit: (fields) =>
      emitAssign(
        `await tableInsert(${fields[TABLE_FIELD_NAME]}, ${fields.row || '{}'})`,
        fields[RESULT_VARIABLE_FIELD_NAME],
      ),
    activitySignature: 'tableInsert(tableId: string, row: unknown): Promise<any>',
    activityCode: [
      'export const tableInsert = (tableId: string, row: unknown): Promise<any> =>',
      '  tableGuard(() => tablesInsertRecord(tableId, tableFieldMapOf(tableId), row, tableContext()));',
    ].join('\n'),
    activityOptions: TABLE_ACTIVITY_OPTIONS,
    resultType: rowType,
  },
  {
    name: TABLE_UPDATE_ACTION_NAME,
    label: 'tables:action.update',
    editorType: 'sidebar',
    fields: [
      tableField,
      {
        name: 'set',
        label: 'tables:field.set',
        help: 'tables:help.set',
        agentNotes: 'An object literal with only the fields that change, e.g. `{ gone: true }`.',
        kind: 'expression',
        expectedType: patchType,
      },
      {
        name: 'where',
        label: 'tables:field.where',
        help: 'tables:help.whereRequired',
        agentNotes: `${buildWhereAgentNotes('field', { required: true })} ${SYSTEM_FIELDS_NOTE} ${VERSION_NOTE}`,
        kind: 'expression',
        expectedType: whereType,
        validate: requireNonBlankWhere,
      },
      resultField,
    ],
    emit: (fields) =>
      emitAssign(
        `await tableUpdate(${fields[TABLE_FIELD_NAME]}, ${fields.set || '{}'}, ${fields.where || 'undefined'})`,
        fields[RESULT_VARIABLE_FIELD_NAME],
      ),
    activitySignature: 'tableUpdate(tableId: string, set: unknown, where: unknown): Promise<number>',
    activityCode: [
      'export const tableUpdate = (tableId: string, set: unknown, where: unknown): Promise<number> =>',
      '  tableGuard(() => tablesUpdateRecords(tableId, tableFieldMapOf(tableId), set, where, tableContext()));',
    ].join('\n'),
    activityOptions: TABLE_ACTIVITY_OPTIONS,
    resultType: int32Type,
  },
  {
    name: TABLE_DELETE_ACTION_NAME,
    label: 'tables:action.delete',
    editorType: 'sidebar',
    fields: [
      tableField,
      {
        name: 'where',
        label: 'tables:field.where',
        help: 'tables:help.whereRequired',
        agentNotes: `${buildWhereAgentNotes('field', { required: true })} ${SYSTEM_FIELDS_NOTE} ${VERSION_NOTE}`,
        kind: 'expression',
        expectedType: whereType,
        validate: requireNonBlankWhere,
      },
      resultField,
    ],
    emit: (fields) =>
      emitAssign(
        `await tableDelete(${fields[TABLE_FIELD_NAME]}, ${fields.where || 'undefined'})`,
        fields[RESULT_VARIABLE_FIELD_NAME],
      ),
    activitySignature: 'tableDelete(tableId: string, where: unknown): Promise<number>',
    activityCode: [
      'export const tableDelete = (tableId: string, where: unknown): Promise<number> =>',
      '  tableGuard(() => tablesDeleteRecords(tableId, tableFieldMapOf(tableId), where, tableContext()));',
    ].join('\n'),
    activityOptions: TABLE_ACTIVITY_OPTIONS,
    resultType: int32Type,
  },
];

/**
 * Emitted once into activities.ts (see `IWorkflowIntegration.sharedActivityCode`). `__falangTableFields` is the
 * compiler-baked `{ [tableDocId]: { [fieldName]: fieldId } }` module constant (`compileActivities`); the
 * `@temporalio/activity` `Context` import line is byte-identical to the tasks vendor's so the import dedup works.
 */
export const TABLES_SHARED_ACTIVITY_CODE: string = [
  "import { Context } from '@temporalio/activity';",
  "import { ApplicationFailure } from '@temporalio/activity';",
  'import {',
  '  isTablesNonRetryable,',
  '  tablesDeleteRecords,',
  '  tablesGetRecord,',
  '  tablesInsertRecord,',
  '  tablesSelectRecords,',
  '  tablesUpdateRecords,',
  "} from '@falang/workflow-integrations-tables';",
  '',
  'const tableFieldMapOf = (tableId: string): Record<string, string> => {',
  '  const fields = __falangTableFields[tableId];',
  '  if (!fields) {',
  '    throw ApplicationFailure.nonRetryable(`table "${tableId}" does not exist in this build`, \'TableError\');',
  '  }',
  '  return fields;',
  '};',
  '',
  'const tableContext = (): { runId: string; workflowId: string; activityId: string } => {',
  '  const info = Context.current().info;',
  '  const workflowExecution = info.workflowExecution;',
  '  if (!workflowExecution) {',
  "    throw ApplicationFailure.nonRetryable('table activities must be called from within a workflow', 'TableError');",
  '  }',
  '  return { runId: workflowExecution.runId, workflowId: workflowExecution.workflowId, activityId: info.activityId };',
  '};',
  '',
  'const tableGuard = async <T>(run: () => Promise<T>): Promise<T> => {',
  '  try {',
  '    return await run();',
  '  } catch (error) {',
  '    if (isTablesNonRetryable(error)) {',
  "      throw ApplicationFailure.nonRetryable((error as Error).message, 'TableError');",
  '    }',
  '    throw error;',
  '  }',
  '};',
].join('\n');
