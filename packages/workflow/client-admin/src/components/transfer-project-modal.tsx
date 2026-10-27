import type React from 'react';
import { useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Checkbox, Input, Modal, Typography, message, type ButtonProps } from 'antd';
import { adminApi, type IAdminUserProject } from '../admin-api.js';

type TRole = 'editor' | 'executor';

/**
 * "Transfer" in the user's projects (ADR 0070 (private)): hands the project to another user by login. The previous owner
 * stays an editor by default; unticking both roles takes their access away.
 */
export const TransferProjectModal: React.FC<{
  project: IAdminUserProject;
  onClose: () => void;
  onTransferred: () => void;
}> = ({ project, onClose, onTransferred }) => {
  const t = getGlobalI18n().t;
  const label = (key: string, options?: Record<string, unknown>) =>
    t(`workflow-client-admin:transfer-project.${key}`, options);
  const [login, setLogin] = useState('');
  const [roles, setRoles] = useState<TRole[]>(['editor']);
  const [busy, setBusy] = useState(false);

  const submit = (): void => {
    const value = login.trim();
    if (!value) return;
    setBusy(true);
    adminApi
      .transferProject(project.id, { login: value, previousOwnerRoles: roles })
      .then(() => {
        message.success(label('done', { name: project.name, login: value }));
        onTransferred();
      })
      .catch((error: unknown) => message.error(error instanceof Error ? error.message : label('failed')))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      title={label('title', { name: project.name })}
      okText={label('ok')}
      okButtonProps={{ disabled: !login.trim(), danger: true, 'data-testid': 'transfer-project-ok' } as ButtonProps}
      confirmLoading={busy}
      onOk={submit}
      onCancel={onClose}
      destroyOnHidden
    >
      <div data-testid="transfer-project-modal">
        <Typography.Paragraph type="secondary">{label('hint')}</Typography.Paragraph>
        <Input
          autoFocus
          placeholder={label('login-placeholder')}
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          onPressEnter={submit}
          data-testid="transfer-project-login"
        />
        <Typography.Paragraph style={{ marginTop: 16, marginBottom: 4 }}>
          {label('previous-owner')}
        </Typography.Paragraph>
        <Checkbox.Group<TRole>
          value={roles}
          onChange={setRoles}
          options={[
            { label: label('role-editor'), value: 'editor' },
            { label: label('role-executor'), value: 'executor' },
          ]}
          data-testid="transfer-project-roles"
        />
      </div>
    </Modal>
  );
};
