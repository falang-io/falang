import type React from 'react';
import { useState } from 'react';
import { Button } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import { WEBHOOK_VENDOR } from '@falang/workflow-integrations-webhook';
import { observer } from 'mobx-react-lite';
import { useWorkflowStore } from '../workflow-store-context.js';
import { WebhookSecurityModal } from './webhook-security-modal.js';

const isWebhookTriggerBody = (root: unknown): boolean => {
  const body = (root as { children?: { data?: { vendor?: unknown } }[] } | null | undefined)?.children?.[1];
  return body?.data?.vendor === WEBHOOK_VENDOR;
};

/** Toolbar button for an open generic-webhook trigger document: opens "Webhook security". Hidden for anything else and in read-only mode. */
export const WebhookSecurityButton: React.FC<{ readonly style: React.CSSProperties }> = observer(({ style }) => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const [open, setOpen] = useState(false);
  const document = store.activeTabId ? store.getDocument(store.activeTabId) : null;
  if (store.readOnly || document?.type !== 'trigger-function' || !isWebhookTriggerBody(document.data)) return null;
  return (
    <>
      <Button
        icon={<SafetyCertificateOutlined />}
        style={style}
        onClick={() => setOpen(true)}
        data-testid="toolbar-webhook-security"
      >
        {t('client:toolbar.webhook-security')}
      </Button>
      <WebhookSecurityModal documentId={document.id} open={open} onClose={() => setOpen(false)} />
    </>
  );
});
