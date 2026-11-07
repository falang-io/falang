import type React from 'react';
import { useRef, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Button, DatePicker, Input, InputNumber, message, Modal, Select, Switch } from 'antd';
import dayjs from 'dayjs';
import type { ITableField } from '@falang/workflow-dto';
import { dateToString, datetimeToIso, isFileRef, jsonCellText, parseJsonCellText } from './table-cell-model.js';

export interface ITableCellInputProps {
  readonly field: ITableField;
  readonly value?: unknown;
  readonly onChange?: (value: unknown) => void;
  /** Inline editing: called when the edit is finished (blur / Enter / a pick). */
  readonly onCommit?: (value: unknown) => void;
  readonly autoFocus?: boolean;
  /** Uploads a file into a `file` cell and returns the stored reference. */
  readonly uploadFile?: (file: File) => Promise<unknown>;
  /** Mints a link for a `file` cell on click (not offered when absent). */
  readonly openFile?: (fileId: string) => void;
}

const errText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type TPick = (value: unknown) => void;

const JsonCell: React.FC<{
  field: ITableField;
  value: unknown;
  autoOpen: boolean;
  pick: TPick;
  cancel: () => void;
}> = ({ field, value, autoOpen, pick, cancel }) => {
  const t = getGlobalI18n().t;
  const [open, setOpen] = useState(autoOpen);
  const [text, setText] = useState(jsonCellText(value));
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        {t('client:table-editor.edit-json')}
      </Button>
      <Modal
        open={open}
        title={field.name}
        okText={t('client:table-editor.ok')}
        cancelText={t('client:table-editor.cancel')}
        onCancel={() => {
          setOpen(false);
          cancel();
        }}
        onOk={() => {
          const parsed = parseJsonCellText(text);
          if (!parsed.ok) {
            message.error(parsed.message);
            return;
          }
          setOpen(false);
          pick(parsed.value);
        }}
      >
        <Input.TextArea
          rows={10}
          value={text}
          onChange={(event) => setText(event.target.value)}
          style={{ fontFamily: 'monospace' }}
        />
      </Modal>
    </>
  );
};

const FileCell: React.FC<{
  value: unknown;
  pick: TPick;
  uploadFile?: (file: File) => Promise<unknown>;
  openFile?: (fileId: string) => void;
}> = ({ value, pick, uploadFile, openFile }) => {
  const t = getGlobalI18n().t;
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const ref = isFileRef(value) ? value : null;

  const onFile = (file: File) => {
    setUploading(true);
    uploadFile?.(file)
      .then((stored) => pick(stored))
      .catch((error: unknown) => message.error(errText(error)))
      .finally(() => setUploading(false));
  };

  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      {ref && (openFile ? <a onClick={() => openFile(ref.id)}>{ref.name}</a> : <span>{ref.name}</span>)}
      {uploadFile && (
        <>
          <input
            ref={input}
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onFile(file);
            }}
          />
          <Button size="small" loading={uploading} onClick={() => input.current?.click()}>
            {t('client:table-editor.upload')}
          </Button>
          {ref && (
            <Button size="small" danger onClick={() => pick(null)}>
              {t('client:table-editor.clear-cell')}
            </Button>
          )}
        </>
      )}
    </span>
  );
};

const DateCell: React.FC<{
  withTime: boolean;
  value: unknown;
  autoFocus: boolean;
  pick: TPick;
  cancel: () => void;
}> = ({ withTime, value, autoFocus, pick, cancel }) => (
  <DatePicker
    showTime={withTime}
    autoFocus={autoFocus}
    {...(autoFocus ? { open: true } : {})}
    style={{ width: '100%' }}
    value={typeof value === 'string' && value ? dayjs(value) : null}
    onChange={(next) => {
      if (next) pick(withTime ? datetimeToIso(next) : dateToString(next));
      else pick(null);
    }}
    onOpenChange={(open) => {
      if (!open && autoFocus) cancel();
    }}
  />
);

/** The editor of one cell, by field type. Controlled: the owner keeps the value (an inline cell or the new-row form). */
export const TableCellInput: React.FC<ITableCellInputProps> = ({
  field,
  value,
  onChange,
  onCommit,
  autoFocus = false,
  uploadFile,
  openFile,
}) => {
  const pick: TPick = (next) => {
    onChange?.(next);
    onCommit?.(next);
  };
  const cancel = () => onCommit?.(value);

  switch (field.type) {
    case 'number': {
      return (
        <InputNumber
          autoFocus={autoFocus}
          style={{ width: '100%' }}
          value={typeof value === 'number' ? value : null}
          onChange={(next) => onChange?.(next)}
          onBlur={cancel}
          onPressEnter={cancel}
        />
      );
    }
    case 'boolean': {
      return <Switch autoFocus={autoFocus} checked={value === true} onChange={(checked) => pick(checked)} />;
    }
    case 'date':
    case 'datetime': {
      return (
        <DateCell
          withTime={field.type === 'datetime'}
          value={value}
          autoFocus={autoFocus}
          pick={pick}
          cancel={cancel}
        />
      );
    }
    case 'select': {
      return (
        <Select
          autoFocus={autoFocus}
          defaultOpen={autoFocus}
          allowClear
          style={{ width: '100%' }}
          value={typeof value === 'string' ? value : null}
          options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
          onChange={(next) => pick(next ?? null)}
          onClear={() => pick(null)}
          onBlur={cancel}
        />
      );
    }
    case 'json': {
      return <JsonCell field={field} value={value} autoOpen={autoFocus} pick={pick} cancel={cancel} />;
    }
    case 'file': {
      return <FileCell value={value} pick={pick} uploadFile={uploadFile} openFile={openFile} />;
    }
    default: {
      return (
        <Input
          autoFocus={autoFocus}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange?.(event.target.value)}
          onBlur={cancel}
          onPressEnter={cancel}
        />
      );
    }
  }
};
