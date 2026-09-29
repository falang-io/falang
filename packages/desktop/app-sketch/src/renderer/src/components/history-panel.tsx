import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { VersionHistoryPanel } from '@falang/antd';
import { getGlobalI18n } from '@falang/scheme';
import { useDesktopProjectStore } from '../desktop-project-store-context.js';
import { appTheme } from '../theme.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, color: appTheme.text, fontSize: 12, minHeight: 0, flex: 1 },
  header: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontWeight: 600, flex: 1 },
  body: { flex: 1, minHeight: 0, overflow: 'auto' },
};

/**
 * `DesktopProjectStore.versionHistory`'s view — thin host wiring over `@falang/antd`'s
 * product-agnostic `VersionHistoryPanel`, same shape as the workflow client's own `HistoryPanel`
 * (ADR 0025 (private)). `onOpenDiff` opens `VersionDiffModal`
 * (`ProjectWorkspace`) rather than the panel owning any modal state of its own. Rendered only while
 * `store.rightPanel === 'history'` — the parent (`ProjectRightSidebar`) already gates mounting this,
 * so there's no `historyPanelOpen`-style guard of its own any more (ADR 0036 (private) §3).
 */
export const HistoryPanel: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useDesktopProjectStore();

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.title}>{t('desktop-app-sketch:history-panel.title')}</span>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => store.toggleRightPanel('history')} />
      </div>
      <div style={styles.body}>
        <VersionHistoryPanel store={store.versionHistory} onOpenDiff={() => store.openDiffModal()} />
      </div>
    </div>
  );
});
