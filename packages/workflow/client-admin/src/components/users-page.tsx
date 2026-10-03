// oxlint-disable max-lines -- one page: table + create/details/password modals over a single store; the additions for
// activation and details are small and share that store.
import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import {
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
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

  @action async createUser(username: string, email?: string): Promise<boolean> {
    this.isCreating = true;
    try {
      const created = await adminApi.createUser(username, email);
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

  @observable activatingId: string | null = null;
  @observable detailsUser: IAdminUser | null = null;

  @action async activate(user: IAdminUser): Promise<void> {
    const t = getGlobalI18n().t;
    this.activatingId = user.id;
    try {
      const result = await adminApi.activateUser(user.id);
      await this.load();
      runInAction(() => {
        this.activatingId = null;
        if (result.sent) message.success(t('workflow-client-admin:users-page.activate-sent'));
        else {
          message.warning(t('workflow-client-admin:users-page.activate-not-sent'));
          this.issuedPassword = { username: user.username, password: result.password };
        }
      });
    } catch (error) {
      runInAction(() => {
        this.activatingId = null;
      });
      message.error(error instanceof Error ? error.message : t('workflow-client-admin:users-page.activate-failed'));
    }
  }

  @action async showDetails(id: string): Promise<void> {
    try {
      const user = await adminApi.getUser(id);
      runInAction(() => {
        this.detailsUser = user;
      });
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : getGlobalI18n().t('workflow-client-admin:users-page.details-failed'),
      );
    }
  }

  @action closeDetails(): void {
    this.detailsUser = null;
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

const formatDate = (value: string | null): string => (value ? new Date(value).toLocaleString() : '—');

const UserDetails: React.FC<{ user: IAdminUser }> = ({ user }) => {
  const t = getGlobalI18n().t;
  const label = (key: string) => t(`workflow-client-admin:users-page.${key}`);
  return (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label={label('username-column')}>{user.username}</Descriptions.Item>
      <Descriptions.Item label={label('email-label')}>{user.email ?? '—'}</Descriptions.Item>
      <Descriptions.Item label={label('status-label')}>{label(`status-${user.status}`)}</Descriptions.Item>
      <Descriptions.Item label={label('company-label')}>{user.companyName ?? '—'}</Descriptions.Item>
      <Descriptions.Item label={label('interest-label')}>
        <span style={{ whiteSpace: 'pre-wrap' }}>{user.automationInterest ?? '—'}</span>
      </Descriptions.Item>
      <Descriptions.Item label={label('source-label')}>
        {label(user.signupSource === 'admin' ? 'source-admin' : 'source-self-service')}
      </Descriptions.Item>
      <Descriptions.Item label={label('created-label')}>{formatDate(user.createdAt)}</Descriptions.Item>
      <Descriptions.Item label={label('verified-label')}>{formatDate(user.emailVerifiedAt)}</Descriptions.Item>
      <Descriptions.Item label={label('activated-label')}>{formatDate(user.activatedAt)}</Descriptions.Item>
      <Descriptions.Item label={label('role-label')}>{user.role}</Descriptions.Item>
    </Descriptions>
  );
};

export const UsersPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [store] = useState(() => new UsersPageStore());
  const [limitsUserId, setLimitsUserId] = useState<string | null>(null);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [createForm] = Form.useForm<{ username: string; email?: string }>();

  const roleOptions = [
    { value: 'user', label: t('workflow-client-admin:users-page.role-user') },
    { value: 'admin', label: t('workflow-client-admin:users-page.role-admin') },
  ];

  const submitCreate = async (values: { username: string; email?: string }) => {
    if (await store.createUser(values.username.trim(), values.email?.trim() ?? '')) {
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Switch checked={onlyPending} onChange={setOnlyPending} />
          {t('workflow-client-admin:users-page.only-pending')}
        </Space>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          {t('workflow-client-admin:users-page.create-user')}
        </Button>
      </div>
      <Table<IAdminUser>
        rowKey="id"
        loading={store.isLoading}
        dataSource={store.users.filter((user) => !onlyPending || user.status === 'pending_activation')}
        pagination={false}
        columns={[
          { title: t('workflow-client-admin:users-page.username-column'), dataIndex: 'username' },
          { title: t('workflow-client-admin:users-page.email-column'), dataIndex: 'email' },
          { title: t('workflow-client-admin:users-page.company-column'), dataIndex: 'companyName' },
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
          {
            title: t('workflow-client-admin:users-page.activated-column'),
            key: 'activated',
            render: (_, user) => {
              if (user.status === 'pending_email') {
                return <Tag color="orange">{t('workflow-client-admin:users-page.email-not-confirmed')}</Tag>;
              }
              return user.activatedAt
                ? new Date(user.activatedAt).toLocaleString()
                : t('workflow-client-admin:users-page.not-activated');
            },
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
                {user.status === 'pending_activation' && (
                  <Popconfirm
                    title={t('workflow-client-admin:users-page.activate-confirm', {
                      name: user.email ?? user.username,
                    })}
                    okText={t('workflow-client-admin:users-page.activate')}
                    cancelText={t('workflow-client-admin:users-page.cancel')}
                    onConfirm={() => store.activate(user)}
                  >
                    <Button size="small" type="primary" loading={store.activatingId === user.id}>
                      {t('workflow-client-admin:users-page.activate')}
                    </Button>
                  </Popconfirm>
                )}
                <Button size="small" onClick={() => store.showDetails(user.id)}>
                  {t('workflow-client-admin:users-page.details')}
                </Button>
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
          <Form.Item
            label={t('workflow-client-admin:users-page.email-optional')}
            name="email"
            rules={[{ type: 'email' }]}
          >
            <Input type="email" />
          </Form.Item>
          <Typography.Text type="secondary">{t('workflow-client-admin:users-page.create-hint')}</Typography.Text>
        </Form>
      </Modal>
      <Modal
        title={t('workflow-client-admin:users-page.details-title')}
        open={store.detailsUser !== null}
        onCancel={() => store.closeDetails()}
        footer={null}
        destroyOnHidden
      >
        {store.detailsUser && <UserDetails user={store.detailsUser} />}
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
