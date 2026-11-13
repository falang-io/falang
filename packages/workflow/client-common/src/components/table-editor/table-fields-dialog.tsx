import type React from 'react';
import { useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button, Checkbox, Input, Modal, Select } from 'antd';
import {
  hasTableFieldDefault,
  type ITableDocumentData,
  type ITableField,
  type TTableFieldType,
} from '@falang/workflow-dto';
import { TableCellInput } from './table-cell-input.js';
import { formatCell } from './table-cell-model.js';
import {
  addField,
  FIELD_TYPE_OPTIONS,
  moveField,
  optionsToText,
  removedFields,
  removeField,
  retypedFields,
  textToOptions,
  updateField,
  validateTableDraft,
} from './table-fields-model.js';
import type { ITableFileActions } from './table-grid.js';

interface IDialogProps {
  readonly open: boolean;
  readonly data: ITableDocumentData;
  readonly files: ITableFileActions | null;
  /** View-only without it. */
  readonly onSave: ((data: ITableDocumentData) => void) | null;
  readonly onClose: () => void;
}

const names = (fields: readonly ITableField[]): string => fields.map((field) => field.name).join(', ');

const DefaultValue: React.FC<{
  field: ITableField;
  readOnly: boolean;
  files: ITableFileActions | null;
  onChange: (value: unknown) => void;
}> = ({ field, readOnly, files, onChange }) => {
  const t = getGlobalI18n().t;
  if (readOnly) return <Input disabled value={formatCell(field, field.defaultValue)} />;
  if (field.type === 'boolean') {
    return (
      <Select
        allowClear
        value={hasTableFieldDefault(field) ? String(field.defaultValue) : null}
        placeholder={t('client:table-editor.field-default-not-set')}
        options={[
          { value: 'true', label: 'true' },
          { value: 'false', label: 'false' },
        ]}
        onChange={(value: string) => onChange(value === 'true')}
        onClear={() => onChange(null)}
      />
    );
  }
  return (
    <TableCellInput
      field={field}
      value={field.defaultValue}
      onChange={onChange}
      uploadFile={files?.upload}
      openFile={files?.open}
    />
  );
};

/** Add / rename / retype / reorder / delete fields. The draft is validated with the shared normaliser on Save. */
export const TableFieldsDialog: React.FC<IDialogProps> = ({ open, data, files, onSave, onClose }) => {
  const t = getGlobalI18n().t;
  const [draft, setDraft] = useState<ITableDocumentData>(data);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(data);
      setError(null);
    }
    // Only the opening resets the draft: `data` may be a new object on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const readOnly = onSave === null;
  const retyped = retypedFields(data, draft);
  const removed = removedFields(data, draft);

  const save = () => {
    const result = validateTableDraft(data, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSave?.(result.data);
    onClose();
  };

  return (
    <Modal
      open={open}
      width={760}
      title={t('client:table-editor.fields')}
      okText={t('client:table-editor.save')}
      cancelText={t('client:table-editor.cancel')}
      okButtonProps={{ style: readOnly ? { display: 'none' } : {}, 'data-testid': 'table-fields-save' }}
      onOk={save}
      onCancel={onClose}
      destroyOnHidden
    >
      <div data-testid="table-fields-dialog" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {draft.fields.map((field, index) => (
          <div
            key={field.id}
            data-testid="table-field-row"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 130px minmax(160px, 200px) auto',
              gap: 12,
              alignItems: 'start',
              padding: 12,
              border: '1px solid var(--ant-color-border, #8c8c8c)',
              borderRadius: 6,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Input
                data-testid="table-field-name"
                disabled={readOnly}
                value={field.name}
                placeholder={t('client:table-editor.field-name')}
                onChange={(event) => setDraft(updateField(draft, field.id, { name: event.target.value }))}
              />
              <Input
                disabled={readOnly}
                size="small"
                value={field.description ?? ''}
                placeholder={t('client:table-editor.field-description')}
                onChange={(event) => setDraft(updateField(draft, field.id, { description: event.target.value }))}
              />
              {field.type === 'select' && (
                <Input.TextArea
                  disabled={readOnly}
                  rows={3}
                  value={optionsToText(field.options)}
                  placeholder={t('client:table-editor.field-options')}
                  onChange={(event) =>
                    setDraft(updateField(draft, field.id, { options: textToOptions(event.target.value) }))
                  }
                />
              )}
            </div>
            <Select
              data-testid="table-field-type"
              disabled={readOnly}
              value={field.type}
              options={FIELD_TYPE_OPTIONS.map((type) => ({
                value: type,
                label: t(`client:table-editor.type-${type}`),
              }))}
              onChange={(type: TTableFieldType) => setDraft(updateField(draft, field.id, { type }))}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Checkbox
                disabled={readOnly}
                checked={field.required === true}
                onChange={(event) => setDraft(updateField(draft, field.id, { required: event.target.checked }))}
              >
                {t('client:table-editor.field-required')}
              </Checkbox>
              {field.required === true && (
                <div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{t('client:table-editor.field-default')}</div>
                  <div data-testid="table-field-default">
                    <DefaultValue
                      field={field}
                      readOnly={readOnly}
                      files={files}
                      onChange={(defaultValue) => setDraft(updateField(draft, field.id, { defaultValue }))}
                    />
                  </div>
                </div>
              )}
            </div>
            {!readOnly && (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <Button size="small" disabled={index === 0} onClick={() => setDraft(moveField(draft, field.id, -1))}>
                  ↑
                </Button>
                <Button
                  size="small"
                  disabled={index === draft.fields.length - 1}
                  onClick={() => setDraft(moveField(draft, field.id, 1))}
                >
                  ↓
                </Button>
                <Button size="small" danger onClick={() => setDraft(removeField(draft, field.id))}>
                  ✕
                </Button>
              </span>
            )}
          </div>
        ))}
        {!readOnly && (
          <Button onClick={() => setDraft(addField(draft))} data-testid="table-add-field">
            {t('client:table-editor.add-field')}
          </Button>
        )}
        {retyped.length > 0 && (
          <Alert type="warning" showIcon message={t('client:table-editor.warn-retype', { fields: names(retyped) })} />
        )}
        {removed.length > 0 && (
          <Alert type="warning" showIcon message={t('client:table-editor.warn-delete', { fields: names(removed) })} />
        )}
        {error && <Alert type="error" showIcon message={error} />}
      </div>
    </Modal>
  );
};
