import type React from 'react';
import { Button } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { navigationStore } from '../navigation-store.js';
import { LanguageSwitcher } from './language-switcher.js';
import { TasksPage } from './tasks-page.js';
import { TopBar } from './top-bar.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#1e1e2e' },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
};

/** An executor-only member's view of a project (ADR 0070 (private)): its Tasks page and nothing else. */
export const TasksOnlyWorkspace: React.FC<{ projectId: string; name: string }> = ({ projectId, name }) => {
  const t = getGlobalI18n().t;
  return (
    <div style={styles.root} data-testid="tasks-only-workspace">
      <TopBar title={name}>
        <LanguageSwitcher />
        <Button type="text" onClick={() => navigationStore.goToProjectList()}>
          {t('client:tasks-page.back-to-projects')}
        </Button>
      </TopBar>
      <div style={styles.body}>
        <TasksPage projectId={projectId} />
      </div>
    </div>
  );
};
