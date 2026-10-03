import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ConfigProvider, Spin, theme as antdTheme } from 'antd';
import { eventTracker } from './analytics/event-tracker.js';
import { authStore } from './auth-store.js';
import { workflowApi } from './api-client.js';
import { navigationStore } from './navigation-store.js';
import { bindNavigationToUrl } from './navigation-url-sync.js';
import { LoginPage } from './components/login-page.js';
import { ProjectListPage } from './components/project-list-page.js';
import { ProjectWorkspace } from './components/project-workspace.js';
import { RunsPage } from './components/runs-page.js';
import { TasksPage } from './components/tasks-page.js';
import { findExtensionView, useClientExtensions } from './extensions/client-extensions.js';
import './locales/register-client-locales.js';

const styles: Record<string, React.CSSProperties> = {
  loading: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1e1e2e',
  },
};

export const App: React.FC = observer(() => {
  const extensions = useClientExtensions();
  const trackerHandler = extensions.eventTracker ?? null;
  useEffect(() => {
    eventTracker.setHandler(trackerHandler);
    return () => eventTracker.setHandler(null);
  }, [trackerHandler]);
  // Hash routing (`#/projects/<id>/documents/<docId>`, `#/runs`, …): the URL is applied once on start
  // and kept in sync with the navigation state, Back/Forward included. `#/admin…` is not ours.
  useEffect(() => bindNavigationToUrl(navigationStore), []);
  // A project opened straight from the URL knows only its id — fetch the name for the toolbar/exports.
  const openProjectId = navigationStore.selectedProjectId;
  const hasProjectName = navigationStore.selectedProjectName !== null;
  const signedIn = authStore.currentUser !== null;
  useEffect(() => {
    if (!openProjectId || hasProjectName || !signedIn) return;
    let cancelled = false;
    workflowApi
      .listProjects()
      .then((projects) => {
        const project = projects.find((item) => item.id === openProjectId);
        if (!cancelled && project) navigationStore.setProjectName(openProjectId, project.name);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [openProjectId, hasProjectName, signedIn]);
  const content = (() => {
    if (!authStore.isAuthChecked) {
      return (
        <div style={styles.loading}>
          <Spin />
        </div>
      );
    }
    if (!authStore.currentUser) return <LoginPage />;
    if (navigationStore.selectedProjectId) {
      return <ProjectWorkspace key={navigationStore.selectedProjectId} projectId={navigationStore.selectedProjectId} />;
    }
    if (navigationStore.view === 'runs') return <RunsPage />;
    if (navigationStore.view === 'tasks') return <TasksPage />;
    const extensionView = findExtensionView(extensions, navigationStore.view);
    if (extensionView) return <>{extensionView.render()}</>;
    return <ProjectListPage />;
  })();

  return <ConfigProvider theme={{ algorithm: antdTheme.darkAlgorithm }}>{content}</ConfigProvider>;
});
