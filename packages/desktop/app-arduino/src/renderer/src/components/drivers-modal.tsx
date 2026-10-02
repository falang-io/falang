import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Form, Input, Modal, Popconfirm, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getGlobalI18n } from '@falang/scheme';
import { reportError } from '../../../shared/report-error.js';
import { driversRegistry } from '../drivers-registry-store.js';
import { driversModalStore } from '../drivers-modal-store.js';
import { navigationStore } from '../navigation-store.js';
import type { IDriverListEntry, TDriverScope } from '../../../shared/driver-ipc-types.js';
import { DriverResultModal } from './driver-result-modal.js';
import { DriverViewModal } from './driver-view-modal.js';

const { Text, Title } = Typography;

/** Store methods report their own failures into the result panel; this only guards against a rejection nobody awaits. */
const go = (promise: Promise<unknown>): void => {
  promise.catch((error: unknown) => reportError('Drivers action failed', error));
};

const StatusTags: React.FC<{ entry: IDriverListEntry }> = ({ entry }) => {
  const t = getGlobalI18n().t;
  const errors = entry.errors ?? [];
  return (
    <Space size={[4, 4]} wrap>
      {entry.status === 'ok' ? (
        <Tag color="green">{t('drivers:status.ok')}</Tag>
      ) : (
        <Tooltip title={errors.length > 0 ? <div style={{ whiteSpace: 'pre-wrap' }}>{errors.join('\n')}</div> : null}>
          <Tag color="red">
            {t(entry.status === 'load-error' ? 'drivers:status.load-error' : 'drivers:status.invalid')}
          </Tag>
        </Tooltip>
      )}
      {entry.overrides ? <Tag color="orange">{t(`drivers:status.overrides-${entry.overrides}`)}</Tag> : null}
      {entry.differsFromLibrary ? <Tag color="blue">{t('drivers:status.differs')}</Tag> : null}
    </Space>
  );
};

const DriverActions: React.FC<{ entry: IDriverListEntry; hasProject: boolean }> = observer(({ entry, hasProject }) => {
  const t = getGlobalI18n().t;
  const store = driversModalStore;
  const disabled = store.busy !== null;
  const link = (key: string, onClick: () => unknown, danger = false, enabled = true): React.ReactNode => (
    <Button key={key} type="link" size="small" danger={danger} disabled={disabled || !enabled} onClick={onClick}>
      {t(`drivers:action.${key}`)}
    </Button>
  );
  const scope = entry.scope;
  if (scope === 'bundled') {
    return (
      <Space size={0} wrap>
        {link('view', () => go(store.view(entry)))}
        {link('download', () => go(store.download(entry)))}
      </Space>
    );
  }
  const editScope = scope;
  const common = [
    link('download', () => go(store.download(entry))),
    link('open-folder', () => go(store.openFolder(entry))),
  ];
  if (scope === 'library') {
    return (
      <Space size={0} wrap>
        {link('add-to-project', () => go(store.addFromLibrary(entry)), false, hasProject)}
        {link('view', () => go(store.view(entry)))}
        {common}
        <Popconfirm
          title={t('drivers:confirm-delete')}
          onConfirm={() => go(store.delete(entry, editScope))}
          disabled={disabled}
        >
          {link('delete', () => null, true)}
        </Popconfirm>
      </Space>
    );
  }
  return (
    <Space size={0} wrap>
      {link('view', () => go(store.view(entry)))}
      {link('validate', () => go(store.validate(entry, editScope)))}
      {common}
      {link('save-to-library', () => go(store.saveToLibrary(entry)))}
      {entry.differsFromLibrary ? link('replace-with-library', () => go(store.replaceWithLibrary(entry))) : null}
      <Popconfirm
        title={t('drivers:confirm-delete')}
        onConfirm={() => go(store.delete(entry, editScope))}
        disabled={disabled}
      >
        {link('delete', () => null, true)}
      </Popconfirm>
    </Space>
  );
});

const GROUP_ORDER: readonly TDriverScope[] = ['project', 'library', 'bundled'];

const NewFromTemplateModal: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = driversModalStore;
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const message = await store.createFromTemplate(id.trim(), label);
    setError(message);
    if (!message) {
      setId('');
      setLabel('');
    }
  };

  return (
    <Modal
      title={t('drivers:template.title')}
      open={store.isTemplateFormOpen}
      onCancel={() => store.setTemplateFormOpen(false)}
      onOk={() => go(submit())}
      confirmLoading={store.busy !== null}
      okText={t('drivers:template.create')}
      cancelText={t('drivers:close')}
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item label={t('drivers:template.id')} extra={t('drivers:template.id-hint')}>
          <Input value={id} onChange={(event) => setId(event.target.value)} placeholder="my-sensor" />
        </Form.Item>
        <Form.Item label={t('drivers:template.label')}>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="My sensor" />
        </Form.Item>
        {error ? <Alert type="error" message={error} /> : null}
      </Form>
    </Modal>
  );
});

/** Sketch → Drivers… (ADR 0054 (private) §5): the project's, the user library's and the built-in drivers, with every management action. */
export const DriversModal: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = driversModalStore;
  const hasProject = navigationStore.openProjectDir !== null;
  const disabled = store.busy !== null;

  const columns = (scope: TDriverScope): ColumnsType<IDriverListEntry> => [
    { title: t('drivers:column.name'), key: 'name', render: (_value, entry) => entry.config.label },
    { title: t('drivers:column.id'), key: 'id', render: (_value, entry) => <Text code>{entry.config.id}</Text> },
    { title: t('drivers:column.version'), key: 'version', render: (_value, entry) => entry.config.version ?? '—' },
    {
      title: t('drivers:column.actions'),
      key: 'actions-count',
      render: (_value, entry) => entry.config.actions.length,
    },
    {
      title: t('drivers:column.device'),
      key: 'device',
      render: (_value, entry) => (entry.config.device ? t('drivers:yes') : t('drivers:no')),
    },
    { title: t('drivers:column.status'), key: 'status', render: (_value, entry) => <StatusTags entry={entry} /> },
    {
      title: '',
      key: 'row-actions',
      render: (_value, entry) => (
        <DriverActions key={`${scope}:${entry.config.id}`} entry={entry} hasProject={hasProject} />
      ),
    },
  ];

  const toolbar = (
    <Space wrap style={{ marginBottom: 12 }}>
      {hasProject ? (
        <>
          <Button disabled={disabled} onClick={() => go(store.uploadBundle('project'))}>
            {t('drivers:toolbar.upload-project')}
          </Button>
          <Button disabled={disabled} onClick={() => go(store.importFolder('project'))}>
            {t('drivers:toolbar.import-folder-project')}
          </Button>
        </>
      ) : null}
      <Button disabled={disabled} onClick={() => go(store.uploadBundle('library'))}>
        {t('drivers:toolbar.upload-library')}
      </Button>
      <Button disabled={disabled} onClick={() => go(store.importFolder('library'))}>
        {t('drivers:toolbar.import-folder-library')}
      </Button>
      {hasProject ? (
        <Button type="primary" disabled={disabled} onClick={() => store.setTemplateFormOpen(true)}>
          {t('drivers:toolbar.new-from-template')}
        </Button>
      ) : null}
    </Space>
  );

  const loadErrors = driversRegistry.payload?.loadErrors ?? [];

  return (
    <>
      <Modal
        title={t('drivers:title')}
        open={store.isOpen}
        onCancel={() => store.close()}
        width={1100}
        footer={[
          <Button key="close" onClick={() => store.close()}>
            {t('drivers:close')}
          </Button>,
        ]}
        destroyOnHidden
      >
        <Spin spinning={store.busy !== null} tip={t('drivers:working')}>
          {toolbar}
          {loadErrors.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={t('drivers:load-errors')}
              description={
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {loadErrors.map((entry) => `${entry.dir}: ${entry.message}`).join('\n')}
                </div>
              }
            />
          ) : null}
          {GROUP_ORDER.filter((scope) => scope !== 'project' || hasProject).map((scope) => {
            const rows = driversRegistry.entries.filter((entry) => entry.scope === scope);
            return (
              <div key={scope} style={{ marginBottom: 16 }} data-testid={`drivers-group-${scope}`}>
                <Title level={5}>{t(`drivers:group.${scope}`)}</Title>
                <Table<IDriverListEntry>
                  size="small"
                  pagination={false}
                  rowKey={(entry) => entry.config.id}
                  columns={columns(scope)}
                  dataSource={rows}
                  locale={{ emptyText: t('drivers:empty') }}
                />
              </div>
            );
          })}
        </Spin>
      </Modal>
      <NewFromTemplateModal />
      <DriverResultModal />
      <DriverViewModal />
    </>
  );
});
