import type React from 'react';

export const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#1e1e2e',
    color: '#cdd6f4',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 8px 8px 12px',
    borderBottom: '1px solid #313244',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6c7086',
  },
  list: { flex: 1, overflowY: 'auto', padding: '4px 0', minHeight: 0 },
  empty: { padding: '12px', color: '#6c7086', fontSize: 12, textAlign: 'center' },
  addBtn: {
    padding: '3px 10px',
    background: '#313244',
    border: 'none',
    borderRadius: 4,
    color: '#cdd6f4',
    fontSize: 11,
    cursor: 'pointer',
  },
  ctxWrap: { position: 'fixed', zIndex: 9999 },
  ctxMenu: { minWidth: 170, boxShadow: '0 4px 16px rgba(0,0,0,0.6)', borderRadius: 6 },
};
