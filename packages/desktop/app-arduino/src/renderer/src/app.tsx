import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ConfigProvider } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { installUndoRedo } from '@falang/desktop-agent-host';
import './locales/register-desktop-locales.js';
import { navigationStore } from './navigation-store.js';
import { openExistingProject } from './project-actions.js';
import { WelcomePage } from './components/welcome-page.js';
import { ProjectWorkspace } from './components/project-workspace.js';
import { AgentSettingsModal } from './components/agent-settings-modal.js';
import { VersioningSettingsModal } from './components/versioning-settings-modal.js';
import { LanguageSettingsModal } from './components/language-settings-modal.js';
import { DriversModal } from './components/drivers-modal.js';
import { driversModalStore } from './drivers-modal-store.js';
import { NewProjectDialog } from './components/new-project-dialog.js';
import { settingsModalStore } from './settings-modal-store.js';
import { versioningSettingsModalStore } from './versioning-settings-modal-store.js';
import { languageSettingsModalStore } from './language-settings-modal-store.js';
import { newProjectDialogStore } from './new-project-dialog-store.js';
import { getActiveProjectStore } from './active-project-store.js';
import { reportError } from '../../shared/report-error.js';

export const App: React.FC = observer(() => {
  useEffect(() => {
    const unsubscribeNew = globalThis.falang.menu.onNewProject(() => newProjectDialogStore.open());
    const unsubscribeOpen = globalThis.falang.menu.onOpenProject((recentPath) =>
      openExistingProject(recentPath).catch((error: unknown) => reportError('Failed to open project', error)),
    );
    const unsubscribeSettings = globalThis.falang.menu.onOpenSettings(() => settingsModalStore.open());
    const unsubscribeVersioningSettings = globalThis.falang.menu.onOpenVersioningSettings(() =>
      versioningSettingsModalStore.open(),
    );
    const unsubscribeLanguageSettings = globalThis.falang.menu.onOpenLanguageSettings(() =>
      languageSettingsModalStore.open(),
    );
    const unsubscribeDrivers = globalThis.falang.menu.onOpenDrivers(() => driversModalStore.open());
    return () => {
      unsubscribeDrivers();
      unsubscribeNew();
      unsubscribeOpen();
      unsubscribeSettings();
      unsubscribeVersioningSettings();
      unsubscribeLanguageSettings();
    };
  }, []);

  // The native menu's project-dependent items (and, in `app-sketch`, the export items per project type) follow the
  // open project — `main` can't know it on its own, so it is reported here, including the back-to-welcome case.
  const menuProjectType = navigationStore.openProjectDir ? 'arduino' : null;
  useEffect(() => {
    globalThis.falang.menu.setContext({ projectType: menuProjectType });
  }, [menuProjectType]);

  // Edit → Undo/Redo and Ctrl+Z on the canvas: text editors undo their own text, otherwise the active document's history.
  useEffect(
    () =>
      installUndoRedo({
        getHistory: () => getActiveProjectStore()?.getActiveHistory() ?? null,
        onMenuUndo: globalThis.falang.menu.onUndo,
        onMenuRedo: globalThis.falang.menu.onRedo,
      }),
    [],
  );

  // `main`'s graceful-close flow (see `main/index.ts`/`graceful-close.ts`) — the window's `close`
  // was just intercepted and is waiting on this ack before it actually closes, so every branch must
  // eventually call `flushBeforeCloseComplete()`, including "no project is open at all".
  useEffect(
    () =>
      globalThis.falang.app.onFlushBeforeClose(() => {
        const activeStore = getActiveProjectStore();
        const flushed = activeStore ? activeStore.flushPendingSaves() : Promise.resolve();
        flushed
          .catch((error: unknown) => reportError('Failed to flush pending saves before close', error))
          .finally(() => globalThis.falang.app.flushBeforeCloseComplete());
      }),
    [],
  );

  // No account/backend here (offline-first) — the persisted language lives in `main`'s local
  // settings.json instead of a `User` row, loaded once on startup (same as `app-sketch`'s `App`).
  useEffect(() => {
    globalThis.falang.settings
      .getLanguage()
      .then((language) => {
        const i18n = getGlobalI18n();
        if (language && language !== i18n.language) return i18n.setLanguage(language);
        return null;
      })
      .catch((error: unknown) => reportError('Failed to load saved language', error));
  }, []);

  const content = navigationStore.openProjectDir ? (
    <ProjectWorkspace key={navigationStore.openProjectDir} projectDir={navigationStore.openProjectDir} />
  ) : (
    <WelcomePage />
  );

  return (
    <ConfigProvider>
      {content}
      <AgentSettingsModal />
      <VersioningSettingsModal />
      <LanguageSettingsModal />
      <DriversModal />
      <NewProjectDialog />
    </ConfigProvider>
  );
});
