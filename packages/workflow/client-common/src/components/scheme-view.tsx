import type React from 'react';
import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import type { Scheme } from '@falang/scheme';
import { SchemeContainer } from '@falang/scheme';
import { useWorkflowStore } from '../workflow-store-context.js';

const styles = {
  root: {
    position: 'relative' as const,
    flex: 1,
    overflow: 'hidden',
    background: '#1e1e2e',
  },
  lockOverlay: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 10,
    background: 'rgba(17, 17, 27, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#cdd6f4',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    textAlign: 'center' as const,
    padding: 24,
  },
};

interface Props {
  scheme: Scheme;
  /** Checked against `WorkflowStore.documentLocksStore` for the blocking overlay — see ADR 0029 (private)'s "Document locks" decision. */
  documentId: string;
  /** `false` while the tab is kept mounted but hidden (see `keep-alive.ts`). */
  active?: boolean;
}

/**
 * Wraps `SchemeContainer` with a blocking, translucent overlay while `documentId` is locked by an
 * agent (`DocumentLocksStore`, polled every 5s by `WorkflowStore`) — `pointer-events: none` isn't
 * used on the canvas itself; the overlay sits on top and simply covers it, which blocks every
 * pointer event by being in the way, the same effect with none of the canvas's own event handlers
 * needing to know about locking.
 */
export const SchemeView: React.FC<Props> = observer(({ scheme, documentId, active = true }) => {
  const store = useWorkflowStore();
  const rootRef = useRef<HTMLDivElement>(null);
  // A hidden (kept-alive) canvas must not keep keyboard focus: an open inline/Monaco editor inside it
  // would otherwise go on receiving the user's typing while another tab is showing.
  useEffect(() => {
    if (active) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && rootRef.current?.contains(focused)) focused.blur();
  }, [active]);
  const lockExpiresAt = store.documentLocksStore.lockExpiresAt(documentId);
  const t = getGlobalI18n().t;
  return (
    <div ref={rootRef} style={styles.root}>
      <SchemeContainer scheme={scheme} />
      {lockExpiresAt && (
        <div style={styles.lockOverlay}>
          {t('client:scheme-view.locked-by-agent', { time: new Date(lockExpiresAt).toLocaleTimeString() })}
        </div>
      )}
    </div>
  );
});
