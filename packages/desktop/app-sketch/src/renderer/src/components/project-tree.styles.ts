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
  newRow: {
    padding: '4px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    borderBottom: `1px solid ${appTheme.border}`,
  },
  newInput: {
    flex: 1,
    background: '#ffffff',
    border: `1px solid ${appTheme.accentBorder}`,
    borderRadius: 3,
    color: appTheme.text,
    padding: '2px 6px',
    fontSize: 13,
    outline: 'none',
  },
  hint: { fontSize: 10, color: appTheme.textMuted, whiteSpace: 'nowrap' },
  // `flexWrap: 'wrap'`: with the `code` domain's 5 document types added, `DOC_TYPE_ORDER` now
  // renders 12 buttons total (6 pre-existing types + 5 `code-*` + Folder) — too many to fit one
  // row at the sidebar's width without wrapping.
  actions: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px', borderTop: `1px solid ${appTheme.border}` },
  btn: {
    flex: '1 1 auto',
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
