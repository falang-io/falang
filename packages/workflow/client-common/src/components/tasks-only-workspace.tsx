import type React from 'react';
import { FalangBrand, navButtonStyle } from './app-header.js';
import { TasksPage } from './tasks-page.js';
import { UserMenu } from './user-menu.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#1e1e2e' },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 16px',
    height: 52,
    background: '#181825',
    borderBottom: '1px solid #313244',
    flexShrink: 0,
  },
  name: { color: '#cdd6f4', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  spacer: { flex: 1 },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
};

/** An executor-only member's view of a project (ADR 0070 (private)): its Tasks page and nothing else. */
export const TasksOnlyWorkspace: React.FC<{ projectId: string; name: string }> = ({ projectId, name }) => (
  <div style={styles.root} data-testid="tasks-only-workspace">
    <div style={styles.bar}>
      <FalangBrand compact />
      <span style={styles.name}>{name}</span>
      <span style={styles.spacer} />
      <UserMenu style={navButtonStyle(false)} />
    </div>
    <div style={styles.body}>
      <TasksPage projectId={projectId} />
    </div>
  </div>
);
