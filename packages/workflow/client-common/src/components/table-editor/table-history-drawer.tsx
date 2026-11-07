import type React from 'react';
import { useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Drawer, message, Popconfirm, Tag, Timeline } from 'antd';
import dayjs from 'dayjs';
import type { ITableChangeEntry, ITableField } from '@falang/workflow-dto';
import { formatCell } from './table-cell-model.js';
import type { TableStore } from './table-store.js';

interface IProps {
  readonly store: TableStore;
  readonly fields: readonly ITableField[];
  /** `null` = closed. */
  readonly recordId: string | null;
  readonly readOnly: boolean;
  readonly onClose: () => void;
}

const describeData = (fields: readonly ITableField[], data: Record<string, unknown> | null): string => {
  if (!data) return '';
  return fields
    .filter((field) => (data[field.id] ?? null) !== null)
    .map((field) => `${field.name}: ${formatCell(field, data[field.id])}`)
    .join('; ');
};

/** Change log of one record, with "Restore this version" (an ordinary update with that change's data). */
export const TableHistoryDrawer: React.FC<IProps> = ({ store, fields, recordId, readOnly, onClose }) => {
  const t = getGlobalI18n().t;
  const [changes, setChanges] = useState<ITableChangeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!recordId) return;
    setLoading(true);
    store
      .history(recordId)
      .then(setChanges)
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false));
  }, [store, recordId]);

  const restore = (change: ITableChangeEntry) => {
    if (!recordId) return;
    store
      .restore(recordId, change.id)
      .then(() => onClose())
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : String(error)));
  };

  return (
    <Drawer
      open={recordId !== null}
      width={460}
      title={t('client:table-editor.history')}
      loading={loading}
      onClose={onClose}
      destroyOnHidden
    >
      <Timeline
        items={changes.map((change) => ({
          key: change.id,
          content: (
            <div data-testid="table-history-entry">
              <div>
                <Tag>{t(`client:table-editor.op-${change.op}`)}</Tag>
                <Tag>{change.source}</Tag>
                <span>{dayjs(change.createdAt).format('YYYY-MM-DD HH:mm:ss')}</span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, margin: '4px 0' }}>
                {describeData(fields, change.after ?? change.before)}
              </div>
              {!readOnly && (
                <Popconfirm title={t('client:table-editor.restore-confirm')} onConfirm={() => restore(change)}>
                  <Button size="small" data-testid="table-history-restore">
                    {t('client:table-editor.restore')}
                  </Button>
                </Popconfirm>
              )}
            </div>
          ),
        }))}
      />
    </Drawer>
  );
};
