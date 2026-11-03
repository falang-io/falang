import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button, Input, Modal, Popconfirm, QRCode, Table, Typography, message } from 'antd';
import { ApiCodedError } from '../api-coded-error.js';
import { workflowApi } from '../api-client.js';
import type { IApiSandboxBinding, IApiSandboxLink } from '../api-types.js';
import { formatRemaining, isExpired, sandboxErrorKey } from '../sandbox-bots-model.js';

const POLL_MS = 5000;

const ignore = (): void => {
  // errors are reported by the callers or retried by the next poll
};

interface ISandboxLinkModalProps {
  readonly open: boolean;
  readonly projectId: string;
  readonly credentialId: string;
  readonly readOnly: boolean;
  readonly flushSave: () => Promise<void>;
  readonly onClose: () => void;
}

const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
};

/** Connect-a-chat dialog: a one-time deep link (+ QR, countdown) and the list of chats bound to the dev stand. */
export const SandboxLinkModal: React.FC<ISandboxLinkModalProps> = ({
  open,
  projectId,
  credentialId,
  readOnly,
  flushSave,
  onClose,
}) => {
  const t = getGlobalI18n().t;
  const [link, setLink] = useState<IApiSandboxLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [bindings, setBindings] = useState<readonly IApiSandboxBinding[]>([]);
  const now = useNow(open);

  const describe = useCallback(
    (error: unknown): string =>
      t(`client:integrations-editor.${sandboxErrorKey(error instanceof ApiCodedError ? error.code : '')}`),
    [t],
  );

  const createLink = useCallback(async () => {
    setCreating(true);
    setLinkError(null);
    try {
      await flushSave();
      setLink(await workflowApi.createSandboxLink(projectId, credentialId));
    } catch (error) {
      setLink(null);
      setLinkError(describe(error));
    } finally {
      setCreating(false);
    }
  }, [projectId, credentialId, flushSave, describe]);

  const loadBindings = useCallback(async () => {
    try {
      setBindings(await workflowApi.listSandboxBindings(projectId, credentialId));
    } catch {
      // keep the previous list; the next poll retries
    }
  }, [projectId, credentialId]);

  useEffect(() => {
    if (!open) return;
    setLink(null);
    setLinkError(null);
    if (!readOnly) createLink().catch(ignore);
    loadBindings().catch(ignore);
    const timer = setInterval(() => {
      loadBindings().catch(ignore);
    }, POLL_MS);
    return () => clearInterval(timer);
    // oxlint-disable-next-line exhaustive-deps -- re-run only when the dialog opens for another instance.
  }, [open, projectId, credentialId]);

  const disconnect = async (bindingId: string) => {
    try {
      await workflowApi.deleteSandboxBinding(projectId, credentialId, bindingId);
      await loadBindings();
    } catch (error) {
      message.error(describe(error));
    }
  };

  const expired = link ? isExpired(link.expiresAt, now) : false;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title={t('client:integrations-editor.sandbox-modal-title')}
      width={560}
      data-testid="sandbox-link-modal"
    >
      {!readOnly && (
        <div style={{ marginBottom: 16 }}>
          <Typography.Paragraph>{t('client:integrations-editor.sandbox-link-intro')}</Typography.Paragraph>
          {linkError ? <Alert type="error" showIcon message={linkError} style={{ marginBottom: 12 }} /> : null}
          {link ? (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <QRCode
                data-testid="sandbox-link-qr"
                value={link.url}
                status={expired ? 'expired' : 'active'}
                size={140}
              />
              <div style={{ flex: 1 }}>
                <Input.Group compact style={{ display: 'flex' }}>
                  <Input data-testid="sandbox-link-url" readOnly value={link.url} />
                  <Button
                    onClick={() => {
                      navigator.clipboard
                        .writeText(link.url)
                        .then(() => message.success(t('client:integrations-editor.sandbox-copied')))
                        .catch(ignore);
                    }}
                  >
                    {t('client:integrations-editor.sandbox-copy')}
                  </Button>
                  <Button href={link.url} target="_blank" rel="noreferrer">
                    {t('client:integrations-editor.sandbox-open')}
                  </Button>
                </Input.Group>
                <Typography.Text type={expired ? 'danger' : 'secondary'}>
                  {expired
                    ? t('client:integrations-editor.sandbox-link-expired')
                    : t('client:integrations-editor.sandbox-link-expires', {
                        remaining: formatRemaining(link.expiresAt, now),
                      })}
                </Typography.Text>
              </div>
            </div>
          ) : null}
          <Button style={{ marginTop: 12 }} loading={creating} onClick={() => createLink()}>
            {t('client:integrations-editor.sandbox-new-link')}
          </Button>
        </div>
      )}
      <Typography.Title level={5}>{t('client:integrations-editor.sandbox-bindings-title')}</Typography.Title>
      <Table<IApiSandboxBinding>
        data-testid="sandbox-bindings-table"
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={[...bindings]}
        locale={{ emptyText: t('client:integrations-editor.sandbox-bindings-empty') }}
        onRow={() => ({ 'data-testid': 'sandbox-binding-row' }) as React.HTMLAttributes<HTMLElement>}
        columns={[
          {
            title: t('client:integrations-editor.sandbox-col-chat'),
            dataIndex: 'chatTitle',
            render: (value: string | null) => value ?? t('client:integrations-editor.sandbox-chat-fallback'),
          },
          {
            title: t('client:integrations-editor.sandbox-col-activity'),
            dataIndex: 'lastActivityAt',
            render: (value: string) => new Date(value).toLocaleString(),
          },
          {
            title: t('client:integrations-editor.sandbox-col-expires'),
            dataIndex: 'expiresAt',
            render: (value: string) => new Date(value).toLocaleString(),
          },
          {
            title: '',
            key: 'actions',
            render: (_, binding) =>
              readOnly ? null : (
                <Popconfirm
                  title={t('client:integrations-editor.sandbox-disconnect-confirm')}
                  onConfirm={() => disconnect(binding.id)}
                >
                  <Button size="small" danger data-testid="sandbox-binding-disconnect">
                    {t('client:integrations-editor.sandbox-disconnect')}
                  </Button>
                </Popconfirm>
              ),
          },
        ]}
      />
    </Modal>
  );
};
