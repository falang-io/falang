import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ConfigProvider, Spin, theme as antdTheme } from 'antd';
import { eventTracker } from './analytics/event-tracker.js';
import { authStore } from './auth-store.js';
import { navigationStore } from './navigation-store.js';
import { bindNavigationToUrl } from './navigation-url-sync.js';
import { LoginPage } from './components/login-page.js';
import { ProjectListPage } from './components/project-list-page.js';
import { ProjectWorkspace } from './components/project-workspace.js';
import { RunsPage } from './components/runs-page.js';
import { TasksPage } from './components/tasks-page.js';
import { AppShell } from './components/app-shell.js';
import { ChangePasswordModal } from './components/change-password-modal.js';
import { PersonalAccessTokensPage } from './components/personal-access-tokens-page.js';
import { SettingsPage } from './components/settings-page.js';
import { SupportWidget } from './components/support-widget.js';
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
  // A project opened straight from the URL knows only its id — `ProjectWorkspace` fetches its name (and
  // whether it opens read-only) with `GET /projects/:id`.
  const page = (): React.ReactNode => {
    switch (navigationStore.view) {
      case 'runs': {
        return <RunsPage />;
      }
      case 'tasks': {
        return <TasksPage />;
      }
      case 'settings': {
        return <SettingsPage />;
      }
      case 'tokens': {
        return <PersonalAccessTokensPage />;
      }
      default: {
        const extensionView = findExtensionView(extensions, navigationStore.view);
        return extensionView ? extensionView.render() : <ProjectListPage />;
      }
    }
  };
  const content = (() => {
    if (!authStore.isAuthChecked) {
      return (
        <div style={styles.loading}>
          <Spin />
        </div>
      );
    }
    if (!authStore.currentUser) return <LoginPage />;
    const main = navigationStore.selectedProjectId ? (
      <ProjectWorkspace key={navigationStore.selectedProjectId} projectId={navigationStore.selectedProjectId} />
    ) : (
      <AppShell>{page()}</AppShell>
    );
    // The support chat and the password dialog are the same everywhere a user is signed in, project included.
    return (
      <>
        {main}
        <SupportWidget />
        <ChangePasswordModal />
      </>
    );
  })();

  return <ConfigProvider theme={{ algorithm: antdTheme.darkAlgorithm }}>{content}</ConfigProvider>;
});
