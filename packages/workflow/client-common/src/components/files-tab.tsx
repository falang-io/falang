import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, InputNumber, message, Popconfirm, Progress, Space, Table, Tag, Typography, Upload } from 'antd';
import { DeleteOutlined, DownloadOutlined, LinkOutlined, UploadOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import { workflowApi, type IApiFile } from '../api-client.js';
import { useWorkflowStore } from '../workflow-store-context.js';

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, overflow: 'auto', padding: 16, color: '#cdd6f4', background: '#1e1e2e' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 8,
  },
  title: { color: '#cdd6f4', margin: 0 },
  actions: { display: 'flex', alignItems: 'center', gap: 8 },
  usage: { maxWidth: 360, marginBottom: 16 },
  usageLine: { color: '#a6adc8' },
  usageHint: { display: 'block', color: '#6c7086', fontSize: 12 },
};

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${UNITS[exponent]}`;
};

/** Same `Blob` + `URL.createObjectURL` + anchor-click pattern as `Toolbar.handleExport`/`downloadAgentChatSessionExport` (`@falang/antd`). */
const triggerBrowserDownload = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * Project-wide Files tab (ADR 0038 (private) §7) — lists every file the
 * project owns (uploaded by a user, or produced/consumed at runtime by a `files`-vendor node), and lets
 * a human upload/download/delete/publish/unpublish one by hand. Reached via `WorkflowStore.activeView`
 * (see `ProjectWorkspace`), not a document tab — there's no backing `documents` row for a project's
 * files the way there is for the pinned `integrations` document.
 */
export const FilesTab: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const filesStore = store.files;
  const [ttlHours, setTtlHours] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    filesStore.load(store.projectId);
  }, [filesStore, store.projectId]);

  const handleUpload = (file: File): boolean => {
    setUploading(true);
    filesStore
      .upload(file, ttlHours)
      .then(() => message.success(t('client:files-tab.upload-success')))
      .catch((error: unknown) =>
        message.error(error instanceof Error ? error.message : t('client:files-tab.upload-failed')),
      )
      .finally(() => setUploading(false));
    // `false` prevents antd's own upload — `FilesStore.upload` above already sent the request.
    return false;
  };

  const handleDelete = (file: IApiFile): void => {
    filesStore
      .remove(file.id)
      .then(() => message.success(t('client:files-tab.delete-success')))
      .catch((error: unknown) =>
        message.error(error instanceof Error ? error.message : t('client:files-tab.delete-failed')),
      );
  };

  const handleDownload = (file: IApiFile): void => {
    setDownloadingId(file.id);
    workflowApi
      .downloadFile(store.projectId, file.id)
      .then((blob) => triggerBrowserDownload(blob, file.name))
      .catch((error: unknown) =>
        message.error(error instanceof Error ? error.message : t('client:files-tab.download-failed')),
      )
      .finally(() => setDownloadingId(null));
  };

  const handlePublish = (file: IApiFile): void => {
    filesStore
      .publish(file.id)
      .then(async (updated) => {
        if (updated.publicUrl && (await copyToClipboard(updated.publicUrl))) {
          message.success(t('client:files-tab.publish-success-copied'));
        } else {
          message.success(t('client:files-tab.publish-success'));
        }
      })
      .catch((error: unknown) =>
        message.error(error instanceof Error ? error.message : t('client:files-tab.publish-failed')),
      );
  };

  const handleUnpublish = (file: IApiFile): void => {
    filesStore
      .unpublish(file.id)
      .then(() => message.success(t('client:files-tab.unpublish-success')))
      .catch((error: unknown) =>
        message.error(error instanceof Error ? error.message : t('client:files-tab.unpublish-failed')),
      );
  };

  const handleCopyLink = (file: IApiFile): void => {
    if (!file.publicUrl) return;
    copyToClipboard(file.publicUrl).then((copied) => {
      if (copied) message.success(t('client:files-tab.link-copied'));
    });
  };

  const usage = filesStore.usage;
  const usagePercent = usage ? Math.min(100, Math.round((usage.usedBytes / usage.maxProjectFilesBytes) * 100)) : 0;

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <Typography.Title level={4} style={styles.title}>
          {t('client:files-tab.title')}
        </Typography.Title>
        <div style={styles.actions}>
          <InputNumber
            min={1}
            placeholder={t('client:files-tab.ttl-placeholder')}
            value={ttlHours}
            onChange={setTtlHours}
            style={{ width: 170 }}
          />
          <Upload showUploadList={false} beforeUpload={handleUpload}>
            <Button icon={<UploadOutlined />} loading={uploading}>
              {t('client:files-tab.upload')}
            </Button>
          </Upload>
        </div>
      </div>

      {usage && (
        <div style={styles.usage}>
          <Typography.Text style={styles.usageLine}>
            {t('client:files-tab.usage', {
              used: formatBytes(usage.usedBytes),
              max: formatBytes(usage.maxProjectFilesBytes),
            })}
          </Typography.Text>
          <Progress
            percent={usagePercent}
            size="small"
            status={usage.usedBytes >= usage.maxProjectFilesBytes ? 'exception' : 'normal'}
          />
          <Typography.Text style={styles.usageHint}>
            {t('client:files-tab.max-file-size', { max: formatBytes(usage.maxFileBytes) })}
          </Typography.Text>
        </div>
      )}

      {filesStore.error && <Typography.Text type="danger">{filesStore.error}</Typography.Text>}

      <Table<IApiFile>
        rowKey="id"
        loading={filesStore.loading}
        dataSource={filesStore.files}
        pagination={false}
        columns={[
          { title: t('client:files-tab.column-name'), dataIndex: 'name' },
          {
            title: t('client:files-tab.column-size'),
            dataIndex: 'size',
            render: (size: number) => formatBytes(size),
          },
          { title: t('client:files-tab.column-mime'), dataIndex: 'mime' },
          { title: t('client:files-tab.column-created-by'), dataIndex: 'createdBy' },
          {
            title: t('client:files-tab.column-created-at'),
            dataIndex: 'createdAt',
            render: (value: string) => new Date(value).toLocaleString(),
          },
          {
            title: t('client:files-tab.column-expires-at'),
            dataIndex: 'expiresAt',
            render: (value: string | null) => (value ? new Date(value).toLocaleString() : '—'),
          },
          {
            title: t('client:files-tab.column-published'),
            key: 'published',
            render: (_: unknown, file: IApiFile) => (
              <Space>
                <Tag color={file.publicUrl ? 'green' : 'default'}>
                  {file.publicUrl ? t('client:files-tab.published') : t('client:files-tab.not-published')}
                </Tag>
                {file.publicUrl ? (
                  <>
                    <Button size="small" icon={<LinkOutlined />} onClick={() => handleCopyLink(file)}>
                      {t('client:files-tab.copy-link')}
                    </Button>
                    <Button size="small" onClick={() => handleUnpublish(file)}>
                      {t('client:files-tab.unpublish')}
                    </Button>
                  </>
                ) : (
                  <Button size="small" onClick={() => handlePublish(file)}>
                    {t('client:files-tab.publish')}
                  </Button>
                )}
              </Space>
            ),
          },
          {
            title: t('client:files-tab.column-actions'),
            key: 'actions',
            render: (_: unknown, file: IApiFile) => (
              <Space>
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  loading={downloadingId === file.id}
                  onClick={() => handleDownload(file)}
                >
                  {t('client:files-tab.download')}
                </Button>
                <Popconfirm title={t('client:files-tab.delete-confirm')} onConfirm={() => handleDelete(file)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    {t('client:files-tab.delete')}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
});
