export const TABLES_VENDOR = 'tables';

export const TABLE_SELECT_ACTION_NAME = 'table-select';
export const TABLE_GET_ACTION_NAME = 'table-get';
export const TABLE_INSERT_ACTION_NAME = 'table-insert';
export const TABLE_UPDATE_ACTION_NAME = 'table-update';
export const TABLE_DELETE_ACTION_NAME = 'table-delete';

export const TABLE_RECORD_CREATED_TRIGGER_NAME = 'table-record-created';
export const TABLE_RECORD_UPDATED_TRIGGER_NAME = 'table-record-updated';
export const TABLE_RECORD_DELETED_TRIGGER_NAME = 'table-record-deleted';

export const TABLE_RECORD_CREATED_SIGNAL = 'tableRecordCreated';
export const TABLE_RECORD_UPDATED_SIGNAL = 'tableRecordUpdated';
export const TABLE_RECORD_DELETED_SIGNAL = 'tableRecordDeleted';

/** Name of the `document-ref` field every table action (and trigger context field) starts with. */
export const TABLE_FIELD_NAME = 'table';
/** Shared across every action's `new-variable` result field. */
export const RESULT_VARIABLE_FIELD_NAME = 'resultVariable';
