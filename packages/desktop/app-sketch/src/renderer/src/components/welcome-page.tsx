import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import type { IRecentProject } from '../../../shared/recent-project.js';
import { openExistingProject } from '../project-actions.js';
import { reportError } from '../../../shared/report-error.js';
import { newProjectDialogStore } from '../new-project-dialog-store.js';
import { LanguageSwitcher } from './language-switcher.js';
import { appTheme } from '../theme.js';

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    background: appTheme.background,
    color: appTheme.text,
    fontFamily: 'system-ui, sans-serif',
  },
  title: { fontSize: 28, fontWeight: 600 },
  actions: { display: 'flex', gap: 12 },
  recent: { width: 360, display: 'flex', flexDirection: 'column', gap: 4 },
  recentHeader: { fontSize: 12, color: appTheme.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' },
  recentItem: {
    padding: '8px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    background: appTheme.panelBackgroundAlt,
  },
  recentPath: { fontSize: 11, color: appTheme.textMuted },
  languageSwitcher: { position: 'absolute', top: 16, right: 16 },
};

export const WelcomePage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [recentProjects, setRecentProjects] = useState<IRecentProject[]>([]);

  useEffect(() => {
    globalThis.falang.recentProjects
      .list()
      .then(setRecentProjects)
      .catch((error: unknown) => reportError('Failed to list recent projects', error));
  }, []);

  return (
    <div style={styles.root}>
      <div style={styles.languageSwitcher}>
        <LanguageSwitcher />
      </div>
      <div style={styles.title}>Falang</div>
      <div style={styles.actions}>
        <Button type="primary" onClick={() => newProjectDialogStore.open()}>
          {t('desktop-app-sketch:welcome-page.new-project')}
        </Button>
        <Button
          onClick={() => openExistingProject().catch((error: unknown) => reportError('Failed to open project', error))}
        >
          {t('desktop-app-sketch:welcome-page.open-project')}
        </Button>
      </div>
      {recentProjects.length > 0 && (
        <div style={styles.recent}>
          <div style={styles.recentHeader}>{t('desktop-app-sketch:welcome-page.recent-projects')}</div>
          {recentProjects.map((project) => (
            <div
              key={project.path}
              style={styles.recentItem}
              onClick={() =>
                openExistingProject(project.path).catch((error: unknown) =>
                  reportError('Failed to open project', error),
                )
              }
            >
              <div>{project.name}</div>
              <div style={styles.recentPath}>{project.path}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
