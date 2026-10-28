import type React from 'react';
import { AppHeader } from './app-header.js';
import { DefaultPasswordBanner } from './default-password-banner.js';

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1e2e',
    overflow: 'hidden',
  },
  content: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' },
};

/** Every page outside a project: the app header stays on top, the page scrolls under it. */
export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={styles.root}>
    <AppHeader />
    <div style={styles.content}>
      <DefaultPasswordBanner />
      {children}
    </div>
  </div>
);
