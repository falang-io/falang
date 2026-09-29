import type React from 'react';
import { observer } from 'mobx-react-lite';
import Modal from 'antd/es/modal/index.js';
import Progress from 'antd/es/progress/index.js';
import Button from 'antd/es/button/index.js';
import { useDesktopProjectStore } from '../desktop-project-store-context.js';

/**
 * Shown while `exportLogicCode`/`exportCodeDocuments` is running — both now run in a disposable
 * worker process instead of blocking this window's own event loop (see ADR 0019 (private)'s
 * "Implementation notes (export worker …)"), so this replaces what used to be a single opaque
 * `message.loading('Exporting code…', 0)` spinner with a live "N of M" progress bar plus the item
 * currently being compiled, and a real Cancel button (`ExportProgressStore.cancel` kills the worker).
 */
export const ExportProgressModal: React.FC = observer(() => {
  const store = useDesktopProjectStore();
  const { active, done, total, label, cancelRequested } = store.exportProgress;
  if (!active) return null;

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Modal
      open
      title="Exporting code…"
      closable={false}
      maskClosable={false}
      footer={[
        <Button key="cancel" disabled={cancelRequested} onClick={() => store.exportProgress.cancel()}>
          {cancelRequested ? 'Cancelling…' : 'Cancel'}
        </Button>,
      ]}
    >
      <Progress percent={percent} status={cancelRequested ? 'exception' : 'active'} />
      <p style={{ marginTop: 12, minHeight: '1.5em' }}>{total > 0 ? `${done} of ${total} — ${label}` : 'Starting…'}</p>
    </Modal>
  );
});
