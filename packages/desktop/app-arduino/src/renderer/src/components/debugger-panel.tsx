import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { DebugPanel } from '@falang/antd';
import type { IDebugLocation } from '@falang/debug';
import { useArduinoProjectStore } from '../arduino-project-store-context.js';
import { appTheme } from '../theme.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 8, color: appTheme.text, fontSize: 12 },
  header: { display: 'flex', alignItems: 'center', gap: 8 },
  title: { fontWeight: 600, flex: 1 },
};

/**
 * The right-hand column's view of the shared `DebugSessionStore` (ADR 0021 (private) §3/§6) — the
 * Arduino analogue of the workflow client's `DebuggerPanel`. No `onJumpToNode`/document lookup across
 * multiple schemes the way the workflow client needs it: an Arduino project has no `call-function`
 * cross-document execution to follow (every document is either `setup`/`loop` or a plain helper
 * function), so the panel is purely status/variables here — `DebuggerModule`'s own per-scheme
 * highlight already does the "which node" part for whichever tab happens to be open.
 */
export const DebuggerPanel: React.FC = observer(() => {
  const store = useArduinoProjectStore();
  const { debugSession } = store;
  if (debugSession.status === 'idle') return null;

  const resolveLocationTitle = ({ documentId, nodeId }: IDebugLocation): string => {
    const document = store.getDocument(documentId);
    return `${document?.name ?? documentId} › ${nodeId}`;
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <span style={styles.title}>Debugger</span>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => debugSession.stop()} />
      </div>
      <DebugPanel session={debugSession} resolveLocationTitle={resolveLocationTitle} />
    </div>
  );
});
