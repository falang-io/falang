import type React from 'react';
import { Button, Form, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import type { IApiVendorData } from '../api-types.js';

const { Text } = Typography;

/**
 * A stored `'schema'` key's shape, loosely — see `@falang/workflow-integrations-sql-common`'s
 * `ISyncedSchema`. Read defensively (this client has no dependency on any one vendor's vendor-data
 * shape, see `IApiVendorData`), so a missing/malformed value just reads as "not synced" rather than
 * throwing.
 */
const readSyncedSchema = (vendorData: IApiVendorData | undefined): { syncedAt: string; tableCount: number } | null => {
  const schema = vendorData?.schema;
  if (!schema || typeof schema.syncedAt !== 'string') return null;
  return { syncedAt: schema.syncedAt, tableCount: Array.isArray(schema.tables) ? schema.tables.length : 0 };
};

interface IVendorDataSyncFieldProps {
  readonly vendorData: IApiVendorData | undefined;
  readonly syncing: boolean;
  readonly onSync: () => void;
}

/**
 * "Sync structure" button + status line, shown for an instance of a vendor with `syncVendorData` (e.g.
 * a database credential) while editing an *existing* instance — see `IntegrationsEditor` and
 * ADR 0039 (private) §4. Same "Form.Item wrapping a per-instance action"
 * shape as `OAuth2ConnectionField`.
 */
export const VendorDataSyncField: React.FC<IVendorDataSyncFieldProps> = ({ vendorData, syncing, onSync }) => {
  const t = getGlobalI18n().t;
  const synced = readSyncedSchema(vendorData);
  return (
    <Form.Item label={t('client:integrations-editor.sync-structure')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button onClick={onSync} loading={syncing}>
          {t('client:integrations-editor.sync-structure-button')}
        </Button>
        <Text type="secondary">
          {synced
            ? t('client:integrations-editor.sync-structure-status-synced', {
                syncedAt: new Date(synced.syncedAt).toLocaleString(),
                tableCount: synced.tableCount,
              })
            : t('client:integrations-editor.sync-structure-status-not-synced')}
        </Text>
      </div>
    </Form.Item>
  );
};
