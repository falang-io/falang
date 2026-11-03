import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, message, Table, Tag, Tooltip, Typography } from 'antd';
import { CopyOutlined, ExportOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import { workflowApi } from '../api-client.js';
import type { IApiSandboxPlatform, IApiTriggerAddress, IApiTriggerAddresses } from '../api-types.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { useWorkflowStore } from '../workflow-store-context.js';

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, overflow: 'auto', padding: 16, color: '#cdd6f4', background: '#1e1e2e' },
  section: { marginBottom: 32, maxWidth: 1100 },
  title: { color: '#cdd6f4', margin: '0 0 8px' },
  hint: { display: 'block', color: '#a6adc8', marginBottom: 12 },
  url: { fontFamily: 'ui-monospace, monospace', fontSize: 12, wordBreak: 'break-all', color: '#cdd6f4' },
  urlCell: { display: 'flex', alignItems: 'flex-start', gap: 6 },
  link: { color: '#89b4fa', cursor: 'pointer' },
};

const copyText = async (text: string): Promise<void> => {
  const t = getGlobalI18n().t;
  try {
    await navigator.clipboard.writeText(text);
    message.success(t('client:addresses-tab.copied'));
  } catch {
    message.error(t('client:addresses-tab.copy-failed'));
  }
};

const vendorLabel = (vendor: string): string => {
  const found = REGISTERED_INTEGRATIONS.find((item) => item.vendor === vendor);
  return found ? getGlobalI18n().t(found.label) : vendor;
};

const UrlCell: React.FC<{ url: string | null; path: string; testId: string }> = ({ url, path, testId }) => {
  const text = url ?? path;
  return (
    <span style={styles.urlCell}>
      <span style={styles.url} data-testid={testId}>
        {text}
      </span>
      <Tooltip title={getGlobalI18n().t('client:addresses-tab.copy')}>
        <Button
          size="small"
          type="text"
          icon={<CopyOutlined />}
          onClick={() => {
            copyText(text);
          }}
        />
      </Tooltip>
    </span>
  );
};

/** Which messenger a test bot belongs to, in the UI's words. */
const PLATFORM_LABEL: Record<string, string> = { telegram: 'Telegram', max: 'MAX', vk: 'ВКонтакте' };

const TriggerAddressesSection: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const [data, setData] = useState<IApiTriggerAddresses | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workflowApi
      .getTriggerAddresses(store.projectId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
    // Re-read when documents change: a new or re-bound trigger changes the list.
  }, [store.projectId, store.documents.length]);

  const columns = [
    {
      title: t('client:addresses-tab.column-trigger'),
      key: 'trigger',
      render: (_: unknown, row: IApiTriggerAddress) => (
        <span>
          <a style={styles.link} onClick={() => store.openTab(row.documentId)}>
            {row.documentName}
          </a>{' '}
          <Tag>{vendorLabel(row.vendor)}</Tag>
        </span>
      ),
    },
    {
      title: t('client:addresses-tab.column-dev'),
      key: 'dev',
      render: (_: unknown, row: IApiTriggerAddress) => (
        <UrlCell url={row.devUrl} path={row.devPath} testId="trigger-address-dev" />
      ),
    },
    {
      title: t('client:addresses-tab.column-prod'),
      key: 'prod',
      render: (_: unknown, row: IApiTriggerAddress) => (
        <UrlCell url={row.prodUrl} path={row.prodPath} testId="trigger-address-prod" />
      ),
    },
  ];

  return (
    <section style={styles.section} data-testid="trigger-addresses">
      <Typography.Title level={4} style={styles.title}>
        {t('client:addresses-tab.triggers-title')}
      </Typography.Title>
      <Typography.Text style={styles.hint}>{t('client:addresses-tab.triggers-hint')}</Typography.Text>
      {loadError && <Alert type="error" showIcon message={loadError} style={{ marginBottom: 12 }} />}
      {data && data.baseUrl === null && data.triggers.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t('client:addresses-tab.no-public-host')}
          style={{ marginBottom: 12 }}
        />
      )}
      <Table
        size="small"
        rowKey="documentId"
        loading={!data && !loadError}
        columns={columns}
        dataSource={data ? [...data.triggers] : []}
        pagination={false}
        locale={{ emptyText: t('client:addresses-tab.triggers-empty') }}
      />
    </section>
  );
});

const TestBotsSection: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  useEffect(() => {
    store.sandboxBots.ensureLoaded();
  }, [store]);
  const platforms = store.sandboxBots.platforms;

  const columns = [
    {
      title: t('client:addresses-tab.column-messenger'),
      key: 'messenger',
      render: (_: unknown, row: IApiSandboxPlatform) => PLATFORM_LABEL[row.vendor] ?? vendorLabel(row.vendor),
    },
    {
      title: t('client:addresses-tab.column-bot'),
      key: 'bot',
      render: (_: unknown, row: IApiSandboxPlatform) => (
        <span data-testid="test-bot-row">
          {row.title && <span>{row.title} </span>}
          <span style={styles.url}>@{row.username}</span>
        </span>
      ),
    },
    {
      title: '',
      key: 'open',
      render: (_: unknown, row: IApiSandboxPlatform) =>
        row.url ? (
          <Button size="small" icon={<ExportOutlined />} href={row.url} target="_blank" rel="noopener">
            {t('client:addresses-tab.open-bot')}
          </Button>
        ) : null,
    },
  ];

  return (
    <section style={styles.section} data-testid="test-bots">
      <Typography.Title level={4} style={styles.title}>
        {t('client:addresses-tab.bots-title')}
      </Typography.Title>
      <Typography.Text style={styles.hint}>{t('client:addresses-tab.bots-hint')}</Typography.Text>
      <Table
        size="small"
        rowKey="vendor"
        columns={columns}
        dataSource={[...platforms]}
        pagination={false}
        locale={{ emptyText: t('client:addresses-tab.bots-empty') }}
      />
    </section>
  );
});

/**
 * The project's "Addresses" system tab: the inbound URLs to paste into third-party services (generic webhook,
 * Bitrix24, YooKassa — messengers and amoCRM subscribe themselves) and the deployment's test bots (ADR 0073 (private)).
 */
export const AddressesTab: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  return (
    <div style={styles.root} data-testid="addresses-tab">
      <TriggerAddressesSection />
      <TestBotsSection />
      <Typography.Text style={styles.hint}>{t('client:addresses-tab.auto-hint')}</Typography.Text>
    </div>
  );
});
