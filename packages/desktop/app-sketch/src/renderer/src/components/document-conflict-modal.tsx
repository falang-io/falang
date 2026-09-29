import type React from 'react';
import { observer } from 'mobx-react-lite';
import Modal from 'antd/es/modal/index.js';
import { useDesktopProjectStore } from '../desktop-project-store-context.js';

/**
 * "Changed on disk — Reload / Keep mine" — shown when a document's file changed externally (an
 * MCP `set_document` call, a git checkout, …) while it has unsaved edits in this window (see
 * ADR 0029 (private)'s "Filesystem watcher" decision and `DesktopProjectStore.conflictQueue`).
 * One at a time: `conflictQueue[0]` drives the modal, further conflicts queue behind it.
 */
export const DocumentConflictModal: React.FC = observer(() => {
  const store = useDesktopProjectStore();
  const documentId = store.conflictQueue[0];
  if (!documentId) return null;
  const doc = store.getDocument(documentId);

  return (
    <Modal
      open
      title="Document changed on disk"
      okText="Reload (discard my changes)"
      cancelText="Keep mine"
      onOk={() => store.resolveConflictReload(documentId)}
      onCancel={() => store.resolveConflictKeepMine(documentId)}
      closable={false}
      maskClosable={false}
    >
      <p>
        {doc ? `"${doc.name}"` : 'This document'} was changed on disk while you had unsaved edits open. Reload to
        discard your changes and load the new content, or keep yours — your next save will overwrite what's on disk.
      </p>
    </Modal>
  );
});
