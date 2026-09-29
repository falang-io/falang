import type React from 'react';
import { observer } from 'mobx-react-lite';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { workflowStore } from './workflow-store.js';
import { ProjectTree } from './components/project-tree.js';
import { TabsBar } from './components/tabs-bar.js';
import { SchemeView } from './components/scheme-view.js';
import { Sidebar } from './components/sidebar.js';
import { ContainerContext } from '@falang/scheme';

const styles = {
  root: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: '#1e1e2e',
  },
  projectTree: {
    width: 220,
    flexShrink: 0,
    borderRight: '1px solid #313244',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minWidth: 0,
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  welcome: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    color: '#6c7086',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
  },
};

export const App: React.FC = observer(() => {
  const activeId = workflowStore.activeTabId;
  const scheme = activeId ? workflowStore.getScheme(activeId) : null;
  return (
    <ConfigProvider theme={{ algorithm: antdTheme.darkAlgorithm }}>
      <div style={styles.root}>
        <div style={styles.projectTree}>
          <ProjectTree />
        </div>

        <div style={styles.main}>
          <TabsBar />
          {scheme ? (
            <ContainerContext value={scheme.container}>
              <div style={styles.content}>
                {activeId ? (
                  <SchemeView key={activeId} scheme={scheme} />
                ) : (
                  <div style={styles.welcome}>
                    <div style={styles.welcomeText}>Create or open a document from the project tree</div>
                  </div>
                )}

                <Sidebar />
              </div>
            </ContainerContext>
          ) : (
            <div style={styles.welcome}>
              <div style={styles.welcomeText}>Create or open a document from the project tree</div>
            </div>
          )}
        </div>
      </div>
    </ConfigProvider>
  );
});
