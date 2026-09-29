import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { VersionHistoryPanel } from '@falang/antd';
import { getGlobalI18n } from '@falang/scheme';
import { useWorkflowStore } from '../workflow-store-context.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, color: '#cdd6f4', fontSize: 12, minHeight: 0, flex: 1 },
  header: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontWeight: 600, flex: 1 },
  body: { flex: 1, minHeight: 0, overflow: 'auto' },
};

/**
 * The project right sidebar's view of `WorkflowStore.versionHistory` (ADR 0025 (private)) — thin host wiring over
 * `@falang/antd`'s product-agnostic `VersionHistoryPanel`, same shape as `DebuggerPanel` over `DebugPanel`.
 * `onOpenDiff` opens the shared `VersionDiffModal` (`ProjectWorkspace`) rather than the panel owning any modal state of
 * its own. Self-guards on `store.rightPanel === 'history'` in addition to `ProjectRightSidebar`'s own check, the same
 * belt-and-suspenders pattern this file already had for `historyPanelOpen` before ADR 0036 (private).
 */
export const HistoryPanel: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  if (store.rightPanel !== 'history') return null;

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.title}>{t('client:history-panel.title')}</span>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => store.toggleRightPanel('history')} />
      </div>
      <div style={styles.body}>
        <VersionHistoryPanel store={store.versionHistory} onOpenDiff={() => store.openDiffModal()} />
      </div>
    </div>
  );
});
