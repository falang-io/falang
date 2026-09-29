import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Typography, message } from 'antd';
import { authStore } from '@falang/workflow-client-common';
import { adminApi, type IAdminUser } from '../admin-api.js';
import { UserLimitsModal } from './user-limits-modal.js';

/**
 * MobX store backing `UsersPage` — mirrors the `useState(() => new XStore())` pattern
 * `ProjectListPage`/`IntegrationsEditor` use elsewhere in this product, kept local to the
 * component rather than a module-level singleton since it has no cross-page state to share.
 */
class UsersPageStore {
  readonly users = observable<IAdminUser>([]);
  @observable isLoading = true;
  @observable updatingId: string | null = null;

  constructor() {
    makeObservable(this);
    this.load();
  }

  @action async load(): Promise<void> {
    this.isLoading = true;
    try {
      const users = await adminApi.listUsers();
      runInAction(() => {
        this.users.replace(users);
        this.isLoading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
      });
      message.error(
        error instanceof Error ? error.message : getGlobalI18n().t('workflow-client-admin:users-page.load-failed'),
      );
    }
  }

  /** Set after a create/reset: the one-time plaintext password to show. */
  @observable issuedPassword: { username: string; password: string } | null = null;
  @observable isCreating = false;
  @observable resettingId: string | null = null;

  @action async createUser(username: string): Promise<boolean> {
    this.isCreating = true;
    try {
      const created = await adminApi.createUser(username);
      await this.load();
      runInAction(() => {
        this.issuedPassword = { username: created.username, password: created.password };
        this.isCreating = false;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.isCreating = false;
      });
      message.error(
        error instanceof Error ? error.message : getGlobalI18n().t('workflow-client-admin:users-page.create-failed'),
      );
      return false;
    }
  }

  @action async resetPassword(user: IAdminUser): Promise<void> {
    this.resettingId = user.id;
    try {
      const { password } = await adminApi.resetUserPassword(user.id);
      runInAction(() => {
        this.issuedPassword = { username: user.username, password };
        this.resettingId = null;
      });
    } catch (error) {
      runInAction(() => {
        this.resettingId = null;
      });
      message.error(
        error instanceof Error ? error.message : getGlobalI18n().t('workflow-client-admin:users-page.reset-failed'),
      );
    }
  }

  @action clearIssuedPassword(): void {
    this.issuedPassword = null;
  }

  @action async updateRole(id: string, role: 'user' | 'admin'): Promise<void> {
    this.updatingId = id;
    try {
      const updated = await adminApi.updateUserRole(id, role);
      runInAction(() => {
        const index = this.users.findIndex((user) => user.id === id);
        if (index !== -1) this.users[index] = updated;
        this.updatingId = null;
      });
    } catch (error) {
      runInAction(() => {
        this.updatingId = null;
      });
      message.error(
        error instanceof Error
          ? error.message
          : getGlobalI18n().t('workflow-client-admin:users-page.update-role-failed'),
      );
    }
  }
}

export const UsersPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [store] = useState(() => new UsersPageStore());
  const [limitsUserId, setLimitsUserId] = useState<string | null>(null);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<{ username: string }>();

  const roleOptions = [
    { value: 'user', label: t('workflow-client-admin:users-page.role-user') },
    { value: 'admin', label: t('workflow-client-admin:users-page.role-admin') },
  ];

  const submitCreate = async (values: { username: string }) => {
    if (await store.createUser(values.username.trim())) {
      setCreateOpen(false);
      createForm.resetFields();
    }
  };

  const copyPassword = async (password: string) => {
    try {
      await navigator.clipboard.writeText(password);
      message.success(t('workflow-client-admin:users-page.copied'));
    } catch {
      message.error(t('workflow-client-admin:users-page.copy-failed'));
    }
  };

  return (
    <>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          {t('workflow-client-admin:users-page.create-user')}
        </Button>
      </div>
      <Table<IAdminUser>
        rowKey="id"
        loading={store.isLoading}
        dataSource={store.users.slice()}
        pagination={false}
        columns={[
          { title: t('workflow-client-admin:users-page.username-column'), dataIndex: 'username' },
          {
            title: t('workflow-client-admin:users-page.role-column'),
            key: 'role',
            render: (_, user) => (
              <Select<'user' | 'admin'>
                value={user.role}
                options={roleOptions}
                style={{ width: 120 }}
                disabled={user.id === authStore.currentUser?.id || store.updatingId === user.id}
                loading={store.updatingId === user.id}
                onChange={(value) => store.updateRole(user.id, value)}
              />
            ),
          },
          { title: t('workflow-client-admin:users-page.language-column'), dataIndex: 'language' },
          {
            title: t('workflow-client-admin:users-page.created-column'),
            dataIndex: 'createdAt',
            render: (createdAt: string) => new Date(createdAt).toLocaleString(),
          },
          { title: t('workflow-client-admin:users-page.projects-column'), dataIndex: 'projectsCount' },
          {
            title: t('workflow-client-admin:users-page.actions-column'),
            key: 'actions',
            render: (_, user) => (
              <Space>
                <Button size="small" onClick={() => setLimitsUserId(user.id)}>
                  {t('workflow-client-admin:users-page.limits')}
                </Button>
                <Popconfirm
                  title={t('workflow-client-admin:users-page.reset-password-confirm', { name: user.username })}
                  okText={t('workflow-client-admin:users-page.reset-password')}
                  cancelText={t('workflow-client-admin:users-page.cancel')}
                  onConfirm={() => store.resetPassword(user)}
                >
                  <Button size="small" loading={store.resettingId === user.id}>
                    {t('workflow-client-admin:users-page.reset-password')}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <UserLimitsModal userId={limitsUserId} onClose={() => setLimitsUserId(null)} />
      <Modal
        title={t('workflow-client-admin:users-page.create-user')}
        open={isCreateOpen}
        onOk={() => createForm.submit()}
        onCancel={() => setCreateOpen(false)}
        okText={t('workflow-client-admin:users-page.create')}
        cancelText={t('workflow-client-admin:users-page.cancel')}
        confirmLoading={store.isCreating}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={submitCreate}>
          <Form.Item
            label={t('workflow-client-admin:users-page.username-column')}
            name="username"
            rules={[{ required: true }, { min: 3, max: 32 }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Typography.Text type="secondary">{t('workflow-client-admin:users-page.create-hint')}</Typography.Text>
        </Form>
      </Modal>
      <Modal
        title={t('workflow-client-admin:users-page.password-issued-title')}
        open={store.issuedPassword !== null}
        onCancel={() => store.clearIssuedPassword()}
        footer={
          <Button type="primary" onClick={() => store.clearIssuedPassword()}>
            {t('workflow-client-admin:users-page.done')}
          </Button>
        }
        maskClosable={false}
      >
        <p>
          {t('workflow-client-admin:users-page.password-issued-for')} <b>{store.issuedPassword?.username}</b>
        </p>
        <Space.Compact style={{ width: '100%' }}>
          <Input readOnly value={store.issuedPassword?.password ?? ''} style={{ fontFamily: 'monospace' }} />
          <Button onClick={() => copyPassword(store.issuedPassword?.password ?? '')}>
            {t('workflow-client-admin:users-page.copy')}
          </Button>
        </Space.Compact>
        <Typography.Text type="warning">{t('workflow-client-admin:users-page.shown-once')}</Typography.Text>
      </Modal>
    </>
  );
});
