import type React from 'react';
import { appTheme } from '../theme.js';

export const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: appTheme.panelBackground,
    color: appTheme.text,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    userSelect: 'none',
  },
  header: {
    padding: '10px 12px 8px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: appTheme.textMuted,
    borderBottom: `1px solid ${appTheme.border}`,
  },
  list: { flex: 1, overflowY: 'auto', padding: '4px 0', minHeight: 0 },
  empty: { padding: '12px', color: appTheme.textMuted, fontSize: 12, textAlign: 'center' },
  actions: { display: 'flex', gap: 4, padding: '8px', borderTop: `1px solid ${appTheme.border}` },
  btn: {
    flex: 1,
    padding: '5px 4px',
    background: appTheme.panelBackgroundAlt,
    border: 'none',
    borderRadius: 4,
    color: appTheme.text,
    fontSize: 11,
    cursor: 'pointer',
  },
  ctxWrap: { position: 'fixed', zIndex: 9999 },
  ctxMenu: { minWidth: 170, boxShadow: appTheme.shadow, borderRadius: 6 },
};
