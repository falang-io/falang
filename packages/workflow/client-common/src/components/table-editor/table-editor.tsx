import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button, message, Popconfirm, Segmented } from 'antd';
import type { ITableDocumentData, ITableRecord, TTableEnv } from '@falang/workflow-dto';
import { workflowApi } from '../../api-client.js';
import { TableCsvImportModal } from './table-csv-import-modal.js';
import { TableFieldsDialog } from './table-fields-dialog.js';
import { TableGrid, type ITableFileActions } from './table-grid.js';
import { TableHistoryDrawer } from './table-history-drawer.js';
import { TableStore } from './table-store.js';

export interface ITableEditorProps {
  readonly projectId: string;
  readonly tableId: string;
  readonly name: string;
  /** The field list: from the store's document, or from an `ITableSummary` where documents can't be read (executor workspace). */
  readonly data: ITableDocumentData;
  /** No edits at all (executor, admin viewer): no add/delete/clear/copy/import, no file uploads or downloads. */
  readonly readOnly?: boolean;
  /** Without it the Fields dialog is view-only. */
  readonly onFieldsChange?: ((data: ITableDocumentData) => void) | null;
  /** A CSV import created fields on the backend: the host must re-read the field list. */
  readonly onFieldsCreated?: () => void;
  /** A guest's template: only the fields exist; no records, no API calls. */
  readonly guest?: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, flex: 1, minWidth: 0, color: '#cdd6f4' },
  bar: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: 600, marginRight: 8 },
  spacer: { flex: 1 },
};

const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const errText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The editor of one project table (ADR 0075 (private)): header actions and the records grid. */
export const TableEditor: React.FC<ITableEditorProps> = observer(
  ({ projectId, tableId, name, data, readOnly = false, onFieldsChange, onFieldsCreated, guest = false }) => {
    const t = getGlobalI18n().t;
    const store = useMemo(() => new TableStore(projectId, tableId, workflowApi), [projectId, tableId]);
    const [fieldsOpen, setFieldsOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [historyFor, setHistoryFor] = useState<string | null>(null);

    useEffect(() => {
      if (!guest) store.load().catch((error: unknown) => message.error(errText(error)));
    }, [store, guest]);

    const files: ITableFileActions | null = readOnly
      ? null
      : {
          upload: (file) => workflowApi.uploadTableFile(projectId, tableId, store.env, file),
          open: (fileId, fileName) => {
            workflowApi
              .downloadTableFile(projectId, tableId, fileId)
              .then((blob) => downloadBlob(blob, fileName))
              .catch((error: unknown) => message.error(errText(error)));
          },
        };

    const exportCsv = () => {
      workflowApi
        .exportTableCsv(projectId, tableId, store.env)
        .then((blob) => downloadBlob(blob, `${name}.csv`))
        .catch((error: unknown) => message.error(errText(error)));
    };

    const run = (action: () => Promise<unknown>) => {
      action().catch((error: unknown) => message.error(errText(error)));
    };

    return (
      <div style={styles.root} data-testid="table-editor">
        <div style={styles.bar}>
          <span style={styles.title}>{name}</span>
          {!guest && (
            <Segmented<TTableEnv>
              data-testid="table-env"
              value={store.env}
              options={[
                { value: 'dev', label: t('client:table-editor.env-dev') },
                { value: 'prod', label: t('client:table-editor.env-prod') },
              ]}
              onChange={(env) => run(() => store.setEnv(env))}
            />
          )}
          <span style={styles.spacer} />
          <Button onClick={() => setFieldsOpen(true)} data-testid="table-fields-button">
            {t('client:table-editor.fields')}
          </Button>
          {!guest && !readOnly && (
            <Button onClick={() => setImportOpen(true)} data-testid="table-import-button">
              {t('client:table-editor.import-csv')}
            </Button>
          )}
          {!guest && (
            <Button onClick={exportCsv} data-testid="table-export-button">
              {t('client:table-editor.export-csv')}
            </Button>
          )}
          {!guest && !readOnly && (
            <Popconfirm
              title={t('client:table-editor.clear-confirm', { env: store.env })}
              onConfirm={() => run(() => store.clear())}
            >
              <Button danger data-testid="table-clear-button">
                {t('client:table-editor.clear')}
              </Button>
            </Popconfirm>
          )}
          {!guest && !readOnly && (
            <Popconfirm
              title={t('client:table-editor.copy-to-prod-confirm')}
              onConfirm={() =>
                run(async () => {
                  const copied = await store.copyToProd();
                  message.success(t('client:table-editor.copied', { count: copied }));
                })
              }
            >
              <Button data-testid="table-copy-prod-button">{t('client:table-editor.copy-to-prod')}</Button>
            </Popconfirm>
          )}
        </div>

        {guest ? (
          <Alert type="info" showIcon message={t('client:table-editor.guest-hint')} />
        ) : (
          <TableGrid
            store={store}
            fields={data.fields}
            readOnly={readOnly}
            files={files}
            onHistory={(record: ITableRecord) => setHistoryFor(record.id)}
          />
        )}

        <TableFieldsDialog
          open={fieldsOpen}
          data={data}
          onSave={readOnly ? null : (onFieldsChange ?? null)}
          onClose={() => setFieldsOpen(false)}
        />
        {!guest && !readOnly && (
          <TableCsvImportModal
            store={store}
            open={importOpen}
            onClose={() => setImportOpen(false)}
            onFieldsCreated={onFieldsCreated}
          />
        )}
        {!guest && (
          <TableHistoryDrawer
            store={store}
            fields={data.fields}
            recordId={historyFor}
            readOnly={readOnly}
            onClose={() => setHistoryFor(null)}
          />
        )}
      </div>
    );
  },
);
