import type { ITriggerDescriptor } from '@falang/workflow-integrations-common';
import {
  TABLE_FIELD_NAME,
  TABLE_RECORD_CREATED_SIGNAL,
  TABLE_RECORD_CREATED_TRIGGER_NAME,
  TABLE_RECORD_DELETED_SIGNAL,
  TABLE_RECORD_DELETED_TRIGGER_NAME,
  TABLE_RECORD_UPDATED_SIGNAL,
  TABLE_RECORD_UPDATED_TRIGGER_NAME,
} from './constants.js';
import { tableEventStructId } from './table-struct-ids.js';

const COMMON_NOTES =
  'The workflow receives `event`: { table (the table id), record (the row, fields by name), previous (the row before ' +
  'the change, only for updated/deleted), changedFields (names of the changed fields, only for updated), source }. ' +
  'It fires only for changes made by workflows (source "workflow") and by the AI agent / MCP (source "agent" / ' +
  '"mcp"). Edits in the table grid, CSV import, "clear" and "copy to prod" NEVER fire it. A trigger-function that ' +
  'writes to its own table fires again by design — guard against a loop by checking `event.source` or ' +
  '`event.changedFields` (for example, return early when only the field you set yourself changed). At most 600 ' +
  'events per minute per table and environment are delivered. Pick the table in "New trigger"; it is fixed ' +
  'afterwards.';

const tableContextField = {
  name: TABLE_FIELD_NAME,
  label: 'tables:field.table',
  kind: 'document-ref',
  documentType: 'table',
} as const;

/** Struct of the payload for one table: `table:<id>#event`. */
const scopeTypeFor: NonNullable<ITriggerDescriptor['scopeTypeFor']> = (triggerConfig) => ({
  type: 'struct',
  id: tableEventStructId(triggerConfig[TABLE_FIELD_NAME] ?? ''),
});

const buildTrigger = (name: string, signalName: string, label: string, what: string): ITriggerDescriptor => ({
  name,
  label,
  scopeType: { type: 'any' },
  scopeTypeFor,
  transformPayload: { kind: 'tables' },
  scopeVariableName: 'event',
  signalName,
  webhookPath: '',
  delivery: 'signal',
  notes: `Starts a workflow when a record of the chosen project table is ${what}. ${COMMON_NOTES}`,
  contextFields: [tableContextField],
  journalMessage: `${'$'}{event.table}: ${what} ${'$'}{event.record.id}`,
});

export const tablesTriggers: readonly ITriggerDescriptor[] = [
  buildTrigger(
    TABLE_RECORD_CREATED_TRIGGER_NAME,
    TABLE_RECORD_CREATED_SIGNAL,
    'tables:trigger.recordCreated',
    'created',
  ),
  buildTrigger(
    TABLE_RECORD_UPDATED_TRIGGER_NAME,
    TABLE_RECORD_UPDATED_SIGNAL,
    'tables:trigger.recordUpdated',
    'updated',
  ),
  buildTrigger(
    TABLE_RECORD_DELETED_TRIGGER_NAME,
    TABLE_RECORD_DELETED_SIGNAL,
    'tables:trigger.recordDeleted',
    'deleted',
  ),
];
