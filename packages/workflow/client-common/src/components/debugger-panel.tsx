import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { DebugPanel } from '@falang/antd';
import type { IDebugLocation } from '@falang/debug';
import { getGlobalI18n } from '@falang/scheme';
import { useWorkflowStore } from '../workflow-store-context.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, color: '#cdd6f4', fontSize: 12 },
  header: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontWeight: 600, flex: 1 },
};

/**
 * The right-hand column's view of the shared `DebugSessionStore` (ADR 0021 (private) §5) — thin
 * host wiring over `@falang/antd`'s product-agnostic `DebugPanel`: resolves a location's title the
 * same way `RunPanel` resolves a position frame's (document name + the icon's own title, falling
 * back to its node id), and jumps via `WorkflowStore.jumpToNode`. No `onStart` — sessions start from
 * the toolbar's "Debug" button, not from this panel.
 */
export const DebuggerPanel: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const { debugSession } = store;
  if (debugSession.status === 'idle') return null;

  const resolveLocationTitle = ({ documentId, nodeId }: IDebugLocation): string => {
    const documentName = store.getDocument(documentId)?.name ?? t('client:run-panel.document-missing');
    const icon = store.hasScheme(documentId) ? store.getScheme(documentId).icons.getIconSafe(nodeId) : null;
    return `${documentName} › ${icon?.title ?? icon?.name ?? nodeId}`;
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.title}>{t('client:debugger-panel.title')}</span>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => debugSession.stop()} />
      </div>
      <DebugPanel
        session={debugSession}
        onJumpToNode={(location) => store.jumpToNode(location.documentId, location.nodeId)}
        resolveLocationTitle={resolveLocationTitle}
      />
    </div>
  );
});
