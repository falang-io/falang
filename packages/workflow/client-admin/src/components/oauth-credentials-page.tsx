import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Form, Input, Modal, Popconfirm, Table, Tag, message } from 'antd';
import { adminApi, type IAdminOAuthCredential } from '../admin-api.js';

interface IFormValues {
  clientId: string;
  clientSecret: string;
}

/** Mirrors `UsersPageStore` — a local, per-mount MobX store for `OAuthCredentialsPage`. */
class OAuthCredentialsPageStore {
  readonly credentials = observable<IAdminOAuthCredential>([]);
  @observable isLoading = true;
  @observable deletingVendor: string | null = null;

  constructor() {
    makeObservable(this);
    this.load();
  }

  @action async load(): Promise<void> {
    this.isLoading = true;
    try {
      const credentials = await adminApi.listOAuthCredentials();
      runInAction(() => {
        this.credentials.replace(credentials);
        this.isLoading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
      });
      message.error(
        error instanceof Error
          ? error.message
          : getGlobalI18n().t('workflow-client-admin:oauth-credentials-page.load-failed'),
      );
    }
  }

  @action async remove(vendor: string): Promise<void> {
    this.deletingVendor = vendor;
    try {
      await adminApi.deleteOAuthCredential(vendor);
      await this.load();
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : getGlobalI18n().t('workflow-client-admin:oauth-credentials-page.delete-failed'),
      );
    } finally {
      runInAction(() => {
        this.deletingVendor = null;
      });
    }
  }
}

export const OAuthCredentialsPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [store] = useState(() => new OAuthCredentialsPageStore());
  const [form] = Form.useForm<IFormValues>();
  const [editing, setEditing] = useState<IAdminOAuthCredential | null>(null);
  const [isSaving, setSaving] = useState(false);

  const openConfigure = (credential: IAdminOAuthCredential) => {
    setEditing(credential);
    form.setFieldsValue({ clientId: credential.clientId ?? '', clientSecret: '' });
  };

  const closeModal = () => {
    setEditing(null);
    form.resetFields();
  };

  const handleSave = async () => {
    if (!editing) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await adminApi.upsertOAuthCredential(editing.vendor, values);
      closeModal();
      await store.load();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : t('workflow-client-admin:oauth-credentials-page.save-failed'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Table<IAdminOAuthCredential>
        rowKey="vendor"
        loading={store.isLoading}
        dataSource={store.credentials.slice()}
        pagination={false}
        columns={[
          { title: t('workflow-client-admin:oauth-credentials-page.piece-column'), dataIndex: 'displayName' },
          { title: t('workflow-client-admin:oauth-credentials-page.vendor-column'), dataIndex: 'vendor' },
          {
            title: t('workflow-client-admin:oauth-credentials-page.status-column'),
            key: 'status',
            render: (_, credential) =>
              credential.enabled ? (
                <Tag color="green">{t('workflow-client-admin:oauth-credentials-page.enabled')}</Tag>
              ) : (
                <Tag color="default">{t('workflow-client-admin:oauth-credentials-page.disabled')}</Tag>
              ),
          },
          {
            title: t('workflow-client-admin:oauth-credentials-page.client-id-column'),
            dataIndex: 'clientId',
            render: (clientId: string | null) => clientId ?? t('workflow-client-admin:oauth-credentials-page.not-set'),
          },
          {
            title: t('workflow-client-admin:oauth-credentials-page.updated-column'),
            dataIndex: 'updatedAt',
            render: (updatedAt: string | null) =>
              updatedAt
                ? new Date(updatedAt).toLocaleString()
                : t('workflow-client-admin:oauth-credentials-page.not-set'),
          },
          {
            title: t('workflow-client-admin:oauth-credentials-page.actions-column'),
            key: 'actions',
            render: (_, credential) => (
              <>
                <Button size="small" onClick={() => openConfigure(credential)} style={{ marginRight: 8 }}>
                  {t('workflow-client-admin:oauth-credentials-page.configure')}
                </Button>
                {credential.enabled && (
                  <Popconfirm
                    title={t('workflow-client-admin:oauth-credentials-page.delete-title')}
                    description={t('workflow-client-admin:oauth-credentials-page.delete-description', {
                      name: credential.displayName,
                    })}
                    okText={t('workflow-client-admin:oauth-credentials-page.delete')}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => store.remove(credential.vendor)}
                  >
                    <Button danger size="small" loading={store.deletingVendor === credential.vendor}>
                      {t('workflow-client-admin:oauth-credentials-page.delete')}
                    </Button>
                  </Popconfirm>
                )}
              </>
            ),
          },
        ]}
      />

      <Modal
        title={
          editing ? t('workflow-client-admin:oauth-credentials-page.modal-title', { name: editing.displayName }) : ''
        }
        open={editing !== null}
        onCancel={closeModal}
        onOk={handleSave}
        confirmLoading={isSaving}
        okText={t('workflow-client-admin:oauth-credentials-page.save')}
        cancelText={t('workflow-client-admin:oauth-credentials-page.cancel')}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="clientId"
            label={t('workflow-client-admin:oauth-credentials-page.client-id-label')}
            rules={[{ required: true }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            name="clientSecret"
            label={t('workflow-client-admin:oauth-credentials-page.client-secret-label')}
            rules={[{ required: true }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
});
