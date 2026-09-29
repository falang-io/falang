import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Table, Typography, message } from 'antd';
import { workflowApi, type IApiPersonalAccessToken, type IApiProject } from '../api-client.js';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  /** For the optional project-scope `Select` and for showing a scoped token's project name in the list. */
  readonly projects: readonly IApiProject[];
}

/**
 * "Personal access tokens" section — see ADR 0029 (private)'s PAT decision
 * (per-user, optional project scope; the raw secret is shown exactly once, at creation, then never
 * again). Reachable from `ProjectListPage`'s header, the same place `LanguageSwitcher`/logout live —
 * this app has no other per-user "settings" surface yet.
 */
export const PersonalAccessTokensModal: React.FC<Props> = ({ open, onClose, projects }) => {
  const t = getGlobalI18n().t;
  const [tokens, setTokens] = useState<IApiPersonalAccessToken[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [isCreating, setCreating] = useState(false);
  const [createdRawToken, setCreatedRawToken] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErrorMessage(null);
    workflowApi
      .listPersonalAccessTokens()
      .then((result) => setTokens(result))
      .catch((error: unknown) =>
        setErrorMessage(
          error instanceof Error ? error.message : t('client:personal-access-tokens-modal.failed-to-load'),
        ),
      )
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  const resetCreateForm = () => {
    setCreateOpen(false);
    setName('');
    setProjectId(null);
    setExpiresInDays(null);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setCreating(true);
    setErrorMessage(null);
    const input: { name: string; projectId?: string; expiresInDays?: number } = { name: trimmedName };
    if (projectId) input.projectId = projectId;
    if (expiresInDays) input.expiresInDays = expiresInDays;
    try {
      const result = await workflowApi.createPersonalAccessToken(input);
      resetCreateForm();
      setCreatedRawToken(result.rawToken);
      load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('client:personal-access-tokens-modal.create-failed'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await workflowApi.revokePersonalAccessToken(id);
      load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('client:personal-access-tokens-modal.revoke-failed'));
    } finally {
      setRevokingId(null);
    }
  };

  const projectName = (id: string | null): string =>
    id
      ? (projects.find((project) => project.id === id)?.name ?? id)
      : t('client:personal-access-tokens-modal.unscoped');

  return (
    <>
      <Modal
        title={t('client:personal-access-tokens-modal.title')}
        open={open}
        onCancel={onClose}
        footer={null}
        width={720}
      >
        {errorMessage && <Typography.Text type="danger">{errorMessage}</Typography.Text>}

        {isCreateOpen ? (
          <Form layout="vertical" style={{ marginBottom: 16 }}>
            <Form.Item label={t('client:personal-access-tokens-modal.name-label')} required>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('client:personal-access-tokens-modal.name-placeholder')}
              />
            </Form.Item>
            <Form.Item label={t('client:personal-access-tokens-modal.project-label')}>
              <Select<string | null>
                allowClear
                value={projectId}
                onChange={(value) => setProjectId(value ?? null)}
                placeholder={t('client:personal-access-tokens-modal.unscoped')}
                options={projects.map((project) => ({ value: project.id, label: project.name }))}
              />
            </Form.Item>
            <Form.Item label={t('client:personal-access-tokens-modal.expires-label')}>
              <InputNumber
                min={1}
                max={3650}
                value={expiresInDays}
                onChange={(value) => setExpiresInDays(value)}
                placeholder={t('client:personal-access-tokens-modal.expires-placeholder')}
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Button type="primary" loading={isCreating} disabled={!name.trim()} onClick={handleCreate}>
              {t('client:personal-access-tokens-modal.create')}
            </Button>
            <Button style={{ marginLeft: 8 }} onClick={resetCreateForm}>
              {t('client:personal-access-tokens-modal.cancel')}
            </Button>
          </Form>
        ) : (
          <Button type="primary" style={{ marginBottom: 16 }} onClick={() => setCreateOpen(true)}>
            {t('client:personal-access-tokens-modal.new-token')}
          </Button>
        )}

        <Table<IApiPersonalAccessToken>
          rowKey="id"
          loading={loading}
          dataSource={tokens ?? []}
          pagination={false}
          columns={[
            { title: t('client:personal-access-tokens-modal.name-column'), dataIndex: 'name' },
            {
              title: t('client:personal-access-tokens-modal.scope-column'),
              key: 'scope',
              render: (_, token) => projectName(token.projectId),
            },
            {
              title: t('client:personal-access-tokens-modal.expires-column'),
              dataIndex: 'expiresAt',
              render: (expiresAt: string | null) =>
                expiresAt ? new Date(expiresAt).toLocaleString() : t('client:personal-access-tokens-modal.never'),
            },
            {
              title: t('client:personal-access-tokens-modal.last-used-column'),
              dataIndex: 'lastUsedAt',
              render: (lastUsedAt: string | null) =>
                lastUsedAt ? new Date(lastUsedAt).toLocaleString() : t('client:personal-access-tokens-modal.never'),
            },
            {
              title: t('client:personal-access-tokens-modal.actions-column'),
              key: 'actions',
              render: (_, token) => (
                <Popconfirm
                  title={t('client:personal-access-tokens-modal.revoke-title')}
                  description={t('client:personal-access-tokens-modal.revoke-description', { name: token.name })}
                  okText={t('client:personal-access-tokens-modal.revoke')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleRevoke(token.id)}
                >
                  <Button danger size="small" loading={revokingId === token.id}>
                    {t('client:personal-access-tokens-modal.revoke')}
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Modal>

      {/* Shown exactly once, right after creation — the raw secret is never retrievable again. */}
      <Modal
        title={t('client:personal-access-tokens-modal.created-title')}
        open={createdRawToken !== null}
        onCancel={() => setCreatedRawToken(null)}
        footer={
          <Button
            type="primary"
            onClick={() => {
              setCreatedRawToken(null);
            }}
          >
            {t('client:personal-access-tokens-modal.created-close')}
          </Button>
        }
      >
        <Typography.Paragraph type="warning">
          {t('client:personal-access-tokens-modal.created-warning')}
        </Typography.Paragraph>
        {createdRawToken && (
          <Typography.Paragraph
            copyable={{
              text: createdRawToken,
              onCopy: () => message.success(t('client:personal-access-tokens-modal.copied')),
            }}
          >
            <Typography.Text code>{createdRawToken}</Typography.Text>
          </Typography.Paragraph>
        )}
      </Modal>
    </>
  );
};
