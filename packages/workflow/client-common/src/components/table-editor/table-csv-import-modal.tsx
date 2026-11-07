import type React from 'react';
import { useRef, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button, Checkbox, message, Modal, Radio } from 'antd';
import type { ITableImportCsvResponse } from '@falang/workflow-dto';
import type { TableStore } from './table-store.js';

interface IProps {
  readonly store: TableStore;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called after a successful import that created fields, so the host can refresh the field list. */
  readonly onFieldsCreated?: () => void;
}

/** CSV import: append or replace, optionally creating fields for unknown columns; shows `{inserted, skipped, errors}`. */
export const TableCsvImportModal: React.FC<IProps> = ({ store, open, onClose, onFieldsCreated }) => {
  const t = getGlobalI18n().t;
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [createMissing, setCreateMissing] = useState(true);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ITableImportCsvResponse | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run = () => {
    if (csv === null) return;
    setBusy(true);
    store
      .importCsv(csv, { mode, createMissingFields: createMissing })
      .then(async (response) => {
        setResult(response);
        await store.afterImport();
        if (response.createdFields.length > 0) onFieldsCreated?.();
      })
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false));
  };

  const close = () => {
    setCsv(null);
    setFileName('');
    setResult(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={t('client:table-editor.import-csv')}
      onCancel={close}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={close}>
          {t('client:table-editor.close')}
        </Button>,
        <Button
          key="run"
          type="primary"
          loading={busy}
          disabled={csv === null || result !== null}
          onClick={run}
          data-testid="table-csv-run"
        >
          {t('client:table-editor.import')}
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          data-testid="table-csv-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setFileName(file.name);
            setResult(null);
            file
              .text()
              .then((text) => setCsv(text))
              .catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)));
          }}
        />
        <div>
          <Button onClick={() => input.current?.click()}>{t('client:table-editor.choose-file')}</Button>
          <span style={{ marginLeft: 8 }}>{fileName}</span>
        </div>
        <Radio.Group value={mode} onChange={(event) => setMode(event.target.value as 'append' | 'replace')}>
          <Radio value="append">{t('client:table-editor.mode-append')}</Radio>
          <Radio value="replace">{t('client:table-editor.mode-replace')}</Radio>
        </Radio.Group>
        {mode === 'replace' && <Alert type="warning" showIcon message={t('client:table-editor.replace-warning')} />}
        <Checkbox checked={createMissing} onChange={(event) => setCreateMissing(event.target.checked)}>
          {t('client:table-editor.create-missing-fields')}
        </Checkbox>
        {result && (
          <div data-testid="table-csv-result">
            <Alert
              type={result.errors.length > 0 ? 'warning' : 'success'}
              showIcon
              message={t('client:table-editor.import-result', { inserted: result.inserted, skipped: result.skipped })}
            />
            {result.errors.length > 0 && (
              <ul style={{ maxHeight: 180, overflow: 'auto', marginTop: 8 }}>
                {result.errors.slice(0, 50).map((error, index) => (
                  <li key={`${error.row}:${index}`}>
                    {t('client:table-editor.import-row-error', { row: error.row, message: error.message })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
