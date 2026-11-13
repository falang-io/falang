import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button, Form, Input, message, Modal, Popconfirm, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import type { ITableField, ITableRecord } from '@falang/workflow-dto';
import { TableCellInput } from './table-cell-input.js';
import {
  buildCellPatch,
  buildInsertData,
  formatCell,
  isFileRef,
  missingRequiredFields,
  parseCellInput,
} from './table-cell-model.js';
import type { TableStore } from './table-store.js';

/** File-cell services the host supplies; absent in read-only mode (no uploads, no downloads). */
export interface ITableFileActions {
  upload(file: File): Promise<unknown>;
  open(fileId: string, name: string): void;
}

interface IGridProps {
  readonly store: TableStore;
  readonly fields: readonly ITableField[];
  readonly readOnly: boolean;
  readonly files: ITableFileActions | null;
  readonly onHistory?: (record: ITableRecord) => void;
}

const sortDirOf = (order: unknown): 'asc' | 'desc' | null => {
  if (order === 'ascend') return 'asc';
  if (order === 'descend') return 'desc';
  return null;
};

const sortOrderOf = (store: TableStore, fieldId: string): 'ascend' | 'descend' | null => {
  if (store.sortField !== fieldId) return null;
  return store.sortDir === 'asc' ? 'ascend' : 'descend';
};

const errText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** One cell: its text, or (not read-only, after a click) the type's editor that saves with the record's version. */
const Cell: React.FC<{
  store: TableStore;
  field: ITableField;
  record: ITableRecord;
  readOnly: boolean;
  files: ITableFileActions | null;
}> = ({ store, field, record, readOnly, files }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<unknown>(record.data[field.id]);
  const current = record.data[field.id];

  const commit = (value: unknown) => {
    setEditing(false);
    const parsed = parseCellInput(field, value);
    if (!parsed.ok) {
      message.error(parsed.message);
      return;
    }
    if (JSON.stringify(parsed.value ?? null) === JSON.stringify(current ?? null)) return;
    store
      .patchRecord(record, buildCellPatch(field, parsed.value))
      .catch((error: unknown) => message.error(errText(error)));
  };

  if (field.type === 'file') {
    const ref = isFileRef(current) ? current : null;
    if (readOnly) return <span>{ref?.name ?? ''}</span>;
    return (
      <TableCellInput
        field={field}
        value={current}
        onCommit={commit}
        uploadFile={files?.upload}
        openFile={files?.open}
      />
    );
  }
  if (field.type === 'boolean' && !readOnly) {
    return <TableCellInput field={field} value={current} onCommit={commit} />;
  }
  if (!editing || readOnly) {
    return (
      <div
        data-testid="table-cell"
        data-field-id={field.id}
        style={{ minHeight: 22, cursor: readOnly ? 'default' : 'text' }}
        onClick={() => {
          if (readOnly) return;
          setDraft(current);
          setEditing(true);
        }}
      >
        {formatCell(field, current)}
      </div>
    );
  }
  return (
    <div data-testid="table-cell-editor" data-field-id={field.id}>
      <TableCellInput autoFocus field={field} value={draft} onChange={setDraft} onCommit={commit} />
    </div>
  );
};

const NewRecordModal: React.FC<{
  store: TableStore;
  fields: readonly ITableField[];
  files: ITableFileActions | null;
  open: boolean;
  onClose: () => void;
}> = ({ store, fields, files, open, onClose }) => {
  const t = getGlobalI18n().t;
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const save = () => {
    const data: Record<string, unknown> = {};
    for (const field of fields) {
      const value = Object.hasOwn(draft, field.id) ? draft[field.id] : field.defaultValue;
      const parsed = parseCellInput(field, value);
      if (!parsed.ok) {
        message.error(parsed.message);
        return;
      }
      if (parsed.value !== null) data[field.id] = parsed.value;
    }
    const missing = missingRequiredFields(fields, data);
    if (missing.length > 0) {
      message.error(t('client:table-editor.required-missing', { fields: missing.map((f) => f.name).join(', ') }));
      return;
    }
    setSaving(true);
    store
      .createRecord(buildInsertData(data))
      .then(() => {
        setDraft({});
        onClose();
      })
      .catch((error: unknown) => message.error(errText(error)))
      .finally(() => setSaving(false));
  };

  return (
    <Modal
      open={open}
      title={t('client:table-editor.add-row')}
      okText={t('client:table-editor.add-row')}
      cancelText={t('client:table-editor.cancel')}
      confirmLoading={saving}
      onOk={save}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form layout="vertical">
        {fields.map((field) => (
          <Form.Item
            key={field.id}
            label={field.name}
            required={field.required === true && (field.defaultValue ?? null) === null}
            extra={field.description}
          >
            <div data-testid="table-new-cell" data-field-name={field.name}>
              <TableCellInput
                field={field}
                value={Object.hasOwn(draft, field.id) ? draft[field.id] : field.defaultValue}
                onChange={(value) => setDraft((prev) => ({ ...prev, [field.id]: value }))}
                uploadFile={files?.upload}
                openFile={files?.open}
              />
            </div>
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
};

/** The records grid: server-side paging/sorting/search, inline cell editing, add/delete/history per row. */
export const TableGrid: React.FC<IGridProps> = observer(({ store, fields, readOnly, files, onHistory }) => {
  const t = getGlobalI18n().t;
  const [adding, setAdding] = useState(false);

  const columns: TableColumnsType<ITableRecord> = fields.map((field) => ({
    key: field.id,
    title: field.name + (field.required ? ' *' : ''),
    sorter: field.type !== 'json' && field.type !== 'file',
    sortOrder: sortOrderOf(store, field.id),
    render: (_value, record) => (
      <Cell
        key={`${record.id}:${record.version}`}
        store={store}
        field={field}
        record={record}
        readOnly={readOnly}
        files={files}
      />
    ),
  }));
  columns.push({
    key: 'actions',
    title: '',
    width: 150,
    render: (_value, record) => (
      <span style={{ display: 'inline-flex', gap: 8 }}>
        {onHistory && (
          <a data-testid="table-row-history" onClick={() => onHistory(record)}>
            {t('client:table-editor.history')}
          </a>
        )}
        {!readOnly && (
          <Popconfirm
            title={t('client:table-editor.delete-row-confirm')}
            onConfirm={() => store.deleteRecord(record.id).catch((error: unknown) => message.error(errText(error)))}
          >
            <a data-testid="table-row-delete">{t('client:table-editor.delete')}</a>
          </Popconfirm>
        )}
      </span>
    ),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Input.Search
          allowClear
          style={{ maxWidth: 320 }}
          placeholder={t('client:table-editor.search')}
          onSearch={(text) => store.setSearch(text)}
          data-testid="table-search"
        />
        {!readOnly && (
          <Button type="primary" onClick={() => setAdding(true)} data-testid="table-add-row">
            {t('client:table-editor.add-row')}
          </Button>
        )}
      </div>
      {store.conflict && (
        <Alert
          type="warning"
          showIcon
          closable
          message={t('client:table-editor.version-conflict')}
          onClose={() => store.clearConflict()}
        />
      )}
      {store.error && <Alert type="error" showIcon message={store.error} />}
      <Table<ITableRecord>
        size="small"
        rowKey="id"
        loading={store.loading}
        dataSource={store.records}
        columns={columns}
        scroll={{ x: 'max-content', y: 'calc(100vh - 340px)' }}
        pagination={{
          current: store.page,
          pageSize: store.pageSize,
          total: store.total,
          showSizeChanger: false,
        }}
        onChange={(pagination, _filters, sorter) => {
          const one = Array.isArray(sorter) ? sorter[0] : sorter;
          const dir = sortDirOf(one?.order);
          const field = dir ? String(one?.columnKey ?? '') : null;
          if (field !== store.sortField || (dir !== null && dir !== store.sortDir)) {
            store.setSort(field, dir);
          } else if (pagination.current && pagination.current !== store.page) {
            store.setPage(pagination.current);
          }
        }}
        locale={{ emptyText: t('client:table-editor.no-rows') }}
      />
      {!readOnly && (
        <NewRecordModal store={store} fields={fields} files={files} open={adding} onClose={() => setAdding(false)} />
      )}
    </div>
  );
});
