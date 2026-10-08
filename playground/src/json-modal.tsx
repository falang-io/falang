import { getDto } from '@falang/scheme';
import { Button, Modal, Space, Typography } from 'antd';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import type { PlaygroundStore } from './playground-store.ts';

/** The live document as it would be persisted — `getDto` with the scheme, so icon meta defaults are included. */
export const JsonModal = observer(({ store }: { store: PlaygroundStore }) => {
  const [copied, setCopied] = useState(false);
  const { scheme } = store;
  // Observed while open: every edit on the canvas re-renders the JSON.
  const json = store.jsonOpen && scheme.rootNode ? JSON.stringify(getDto(scheme.rootNode.id, scheme), null, 2) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      title={`Document JSON — ${store.rootKind}`}
      open={store.jsonOpen}
      onCancel={() => store.setJsonOpen(false)}
      width="min(900px, calc(100vw - 32px))"
      footer={
        <Space>
          <Typography.Text type="secondary">{json.length.toLocaleString()} chars</Typography.Text>
          <Button onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
          <Button type="primary" onClick={() => store.setJsonOpen(false)}>
            Close
          </Button>
        </Space>
      }
    >
      <pre
        style={{
          margin: 0,
          maxHeight: '70vh',
          overflow: 'auto',
          fontSize: 12,
          lineHeight: 1.45,
          padding: 12,
          borderRadius: 6,
          background: 'rgba(127, 127, 127, 0.1)',
        }}
      >
        {json}
      </pre>
    </Modal>
  );
});
