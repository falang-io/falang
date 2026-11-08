import type React from 'react';
import { useEffect, useState } from 'react';
import { Input, Modal, theme } from 'antd';

export interface INameModalProps {
  open: boolean;
  title: React.ReactNode;
  /** The current name when renaming, `''` when creating. OK stays disabled while the input equals it. */
  initialName: string;
  okText: string;
  placeholder?: string;
  /** A short line under the input (e.g. where the new item goes). */
  hint?: React.ReactNode;
  inputTestId?: string;
  /** The reason `name` is not acceptable (already translated), or `null`. */
  validate: (name: string) => string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

/** One name input with live validation — the project trees' create and "Rename" dialogs for documents and folders (workflow client, desktop IDEs). */
export const NameModal: React.FC<INameModalProps> = ({
  open,
  title,
  initialName,
  okText,
  placeholder,
  hint,
  inputTestId,
  validate,
  onSubmit,
  onClose,
}) => {
  const { token } = theme.useToken();
  const [name, setName] = useState(initialName);
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const unchanged = name.trim() === initialName;
  const error = unchanged ? null : validate(name);
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
      okText={okText}
      okButtonProps={{ disabled: Boolean(error) || unchanged }}
      destroyOnHidden
    >
      <Input
        autoFocus
        {...(inputTestId ? { 'data-testid': inputTestId } : {})}
        {...(placeholder ? { placeholder } : {})}
        value={name}
        {...(error ? { status: 'error' as const } : {})}
        onChange={(event) => setName(event.target.value)}
        onPressEnter={submit}
      />
      {error && <div style={{ color: token.colorError, marginTop: 8 }}>{error}</div>}
      {hint && <div style={{ color: token.colorTextSecondary, fontSize: 12, marginTop: 8 }}>{hint}</div>}
    </Modal>
  );
};
