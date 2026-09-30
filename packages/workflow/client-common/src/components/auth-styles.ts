import type React from 'react';

export const authStyles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1e1e2e',
    padding: '24px 0',
  },
  card: {
    width: 340,
    padding: 32,
    background: '#181825',
    borderRadius: 8,
    border: '1px solid #313244',
  },
  title: { color: '#cdd6f4', marginBottom: 24, textAlign: 'center' },
};
