import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Modal } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { useWorkflowStore } from '../workflow-store-context.js';

// Not inline literals: a fresh object literal would fail antd's excess-property check on `data-*`.
const OK_PROPS = { 'data-testid': 'magic-confirm-ok' };
const KEEP_PROPS = { 'data-testid': 'magic-confirm-keep' };

/** "Update the steps to match the new text?" / "Regenerate the steps with AI?" (ADR 0046 (private)). */
export const MagicConfirmModal: React.FC = observer(() => {
  const store = useWorkflowStore();
  const t = getGlobalI18n().t;
  const confirm = store.magicRuns.pendingConfirm;
  if (!confirm) return null;
  const regenerate = confirm.kind === 'regenerate';
  return (
    <Modal
      open
      centered
      maskClosable={false}
      title={t(regenerate ? 'client:magic.confirm-regenerate-title' : 'client:magic.confirm-update-title')}
      okText={t(regenerate ? 'client:magic.confirm-regenerate-ok' : 'client:magic.confirm-update-ok')}
      cancelText={t('client:magic.confirm-keep')}
      okButtonProps={OK_PROPS}
      cancelButtonProps={KEEP_PROPS}
      onOk={() => store.magicRuns.resolveConfirm(true)}
      onCancel={() => store.magicRuns.resolveConfirm(false)}
    />
  );
});
