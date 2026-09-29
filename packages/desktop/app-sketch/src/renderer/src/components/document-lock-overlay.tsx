import type React from 'react';
import { observer } from 'mobx-react-lite';
import type { IDocumentLock } from '@falang/desktop-project-fs';
import { appTheme } from '../theme.js';

const styles = {
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    background: appTheme.overlayBackground,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    color: appTheme.text,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    textAlign: 'center' as const,
    padding: 16,
  },
};

interface Props {
  lock: IDocumentLock;
}

/**
 * Blocks pointer events on the document underneath entirely (it's the topmost thing in the
 * stacking context, covering the whole scheme canvas — see `ProjectWorkspace`'s wrapper `div`) and
 * tells the user why: ADR 0029 (private)'s "one source of editing at a time" model treats every
 * lock as foreign in v1, so this is purely informational, not an "unlock" affordance.
 */
export const DocumentLockOverlay: React.FC<Props> = observer(({ lock }) => {
  const until = new Date(lock.expiresAt).toLocaleTimeString();
  return (
    <div style={styles.overlay}>
      <div>Locked by an agent until {until}</div>
    </div>
  );
});
