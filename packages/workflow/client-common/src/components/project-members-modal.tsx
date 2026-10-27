import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Input, Modal, Popconfirm, Spin, Table, Tag, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import {
  workflowApi,
  type IApiProjectMember,
  type IApiProjectMembers,
  type TApiProjectMemberRole,
} from '../api-client.js';

interface Props {
  readonly projectId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}

const ROLES: readonly TApiProjectMemberRole[] = ['editor', 'executor'];

/** A row of the table: the owner (fixed) or a member (roles editable). */
interface IRow {
  readonly key: string;
  readonly username: string;
  readonly email: string | null;
  readonly openTasks: number;
  readonly member: IApiProjectMember | null;
}

const errorText = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

/**
 * "Project → Users" (ADR 0070 (private)): add a user by login with the editor and/or executor role, change roles,
 * remove. Used by the owner, an editor, and a platform admin (also from the admin app's user details).
 */
export const ProjectMembersModal: React.FC<Props> = ({ projectId, open, onClose }) => {
  const t = getGlobalI18n().t;
  const [data, setData] = useState<IApiProjectMembers | null>(null);
  const [login, setLogin] = useState('');
  const [roles, setRoles] = useState<TApiProjectMemberRole[]>(['editor']);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const run = useCallback(
    (action: () => Promise<IApiProjectMembers>, fallbackKey: string): Promise<boolean> => {
      setBusy(true);
      setErrorMessage(null);
      return action()
        .then((next) => {
          setData(next);
          return true;
        })
        .catch((error: unknown) => {
          setErrorMessage(errorText(error, t(fallbackKey)));
          return false;
        })
        .finally(() => setBusy(false));
    },
    [t],
  );

  useEffect(() => {
    if (!open) return;
    setData(null);
    setLogin('');
    setRoles(['editor']);
    run(() => workflowApi.listProjectMembers(projectId), 'client:project-members.failed-to-load');
  }, [open, projectId, run]);

  const add = (): void => {
    const value = login.trim();
    if (!value || roles.length === 0) return;
    run(() => workflowApi.addProjectMember(projectId, value, roles), 'client:project-members.failed-to-add').then(
      (ok) => {
        if (ok) setLogin('');
      },
    );
  };

  const setMemberRoles = (member: IApiProjectMember, next: TApiProjectMemberRole[]): void => {
    run(() => workflowApi.setProjectMemberRoles(projectId, member.id, next), 'client:project-members.failed-to-save');
  };

  const rows: IRow[] = data
    ? [
        ...(data.owner
          ? [
              {
                key: data.owner.id,
                username: data.owner.username,
                email: data.owner.email,
                openTasks: data.owner.openTasks,
                member: null,
              },
            ]
          : []),
        ...data.members.map((member) => ({
          key: member.id,
          username: member.username,
          email: member.email,
          openTasks: member.openTasks,
          member,
        })),
      ]
    : [];

  const roleOptions = ROLES.map((role) => ({ value: role, label: t(`client:project-members.role-${role}`) }));

  return (
    <Modal
      title={t('client:project-members.title')}
      open={open}
      onCancel={onClose}
      destroyOnHidden
      width={720}
      footer={<Button onClick={onClose}>{t('client:project-members.close')}</Button>}
      data-testid="project-members-modal"
    >
      <Typography.Paragraph type="secondary">{t('client:project-members.hint')}</Typography.Paragraph>
      {errorMessage && <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 12 }} />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Input
          style={{ flex: 1, minWidth: 200 }}
          placeholder={t('client:project-members.login-placeholder')}
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          onPressEnter={add}
          data-testid="project-members-login"
        />
        <Checkbox.Group
          options={roleOptions}
          value={roles}
          onChange={(value) => setRoles(value as TApiProjectMemberRole[])}
          data-testid="project-members-new-roles"
        />
        <Button
          type="primary"
          onClick={add}
          loading={busy}
          disabled={!login.trim() || roles.length === 0}
          data-testid="project-members-add"
        >
          {t('client:project-members.add')}
        </Button>
      </div>
      {data === null && !errorMessage && <Spin />}
      {data && (
        <Table<IRow>
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={rows}
          data-testid="project-members-table"
          columns={[
            {
              title: t('client:project-members.column-user'),
              render: (_: unknown, row) => (
                <span data-testid="project-members-row" data-username={row.username}>
                  {row.username}
                  {row.email && row.email !== row.username && (
                    <Typography.Text type="secondary"> · {row.email}</Typography.Text>
                  )}
                </span>
              ),
            },
            {
              title: t('client:project-members.column-roles'),
              render: (_: unknown, row) =>
                row.member ? (
                  <Checkbox.Group
                    options={roleOptions}
                    value={[...row.member.roles]}
                    disabled={busy}
                    onChange={(value) => {
                      const next = value as TApiProjectMemberRole[];
                      if (next.length > 0 && row.member) setMemberRoles(row.member, next);
                    }}
                  />
                ) : (
                  <Tag color="gold">{t('client:project-members.role-owner')}</Tag>
                ),
            },
            {
              title: t('client:project-members.column-open-tasks'),
              dataIndex: 'openTasks',
              width: 110,
            },
            {
              title: '',
              width: 90,
              render: (_: unknown, row) =>
                row.member && (
                  <Popconfirm
                    title={t('client:project-members.remove-confirm', { username: row.username })}
                    okText={t('client:project-members.remove')}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => {
                      const { member } = row;
                      if (member) setMemberRoles(member, []);
                    }}
                  >
                    <Button danger type="text" size="small" disabled={busy}>
                      {t('client:project-members.remove')}
                    </Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      )}
    </Modal>
  );
};
