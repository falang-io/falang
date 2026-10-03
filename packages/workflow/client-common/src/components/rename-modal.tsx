import type React from 'react';
import { useEffect, useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { Input, Modal } from 'antd';

interface IRenameModalProps {
  open: boolean;
  title: string;
  initialName: string;
  /** The reason `name` is not acceptable (already translated), or `null`. */
  validate: (name: string) => string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

/** One name input with live validation — used by the project tree's "Rename" for documents and folders. */
export const RenameModal: React.FC<IRenameModalProps> = ({ open, title, initialName, validate, onSubmit, onClose }) => {
  const t = getGlobalI18n().t;
  const [name, setName] = useState(initialName);
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const error = name.trim() === initialName ? null : validate(name);
  const unchanged = name.trim() === initialName;
  const submit = () => {
    if (error || unchanged) return;
    onSubmit(name.trim());
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText={t('client:project-tree.rename-ok')}
      okButtonProps={{ disabled: Boolean(error) || unchanged }}
      destroyOnHidden
    >
      <Input
        autoFocus
        data-testid="rename-input"
        value={name}
        {...(error ? { status: 'error' as const } : {})}
        onChange={(event) => setName(event.target.value)}
        onPressEnter={submit}
      />
      {error && <div style={{ color: '#f38ba8', marginTop: 8 }}>{error}</div>}
    </Modal>
  );
};
