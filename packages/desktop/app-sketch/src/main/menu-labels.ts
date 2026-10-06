export type TMenuLanguage = 'en' | 'ru';

interface IMenuLabels {
  file: string;
  newProject: string;
  openProject: string;
  recentProjects: string;
  noRecentProjects: string;
  close: string;
  quit: string;
  project: string;
  exportConfig: string;
  exportCode: string;
  exportCodeDocuments: string;
  versionHistory: string;
  /** The right sidebar's "Agent" toggle (ADR 0036 (private)) — distinct from `agent` above, which
   *  opens the Settings → Agent… configuration modal. */
  agentPanel: string;
  exportPdf: string;
  edit: string;
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
  settings: string;
  agent: string;
  versioning: string;
  language: string;
  help: string;
  view: string;
  toggleDevTools: string;
  reload: string;
  forceReload: string;
  about: string;
}

const EN: IMenuLabels = {
  file: 'File',
  newProject: 'New Project…',
  openProject: 'Open Project…',
  recentProjects: 'Recent Projects',
  noRecentProjects: 'No recent projects',
  close: 'Close',
  quit: 'Quit',
  project: 'Project',
  exportConfig: 'Export Configuration…',
  exportCode: 'Export Code',
  exportCodeDocuments: 'Export Code Documents',
  versionHistory: 'Version History',
  agentPanel: 'Agent',
  exportPdf: 'Export PDF…',
  edit: 'Edit',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select All',
  settings: 'Settings',
  agent: 'Agent…',
  versioning: 'Versioning…',
  language: 'Language…',
  help: 'Help',
  view: 'View',
  toggleDevTools: 'Toggle Developer Tools',
  reload: 'Reload',
  forceReload: 'Force Reload',
  about: 'About',
};

const RU: IMenuLabels = {
  file: 'Файл',
  newProject: 'Новый проект…',
  openProject: 'Открыть проект…',
  recentProjects: 'Недавние проекты',
  noRecentProjects: 'Нет недавних проектов',
  close: 'Закрыть',
  quit: 'Выйти',
  project: 'Проект',
  exportConfig: 'Настройка экспорта…',
  exportCode: 'Экспортировать код',
  exportCodeDocuments: 'Экспортировать документы кода',
  versionHistory: 'История версий',
  agentPanel: 'Агент',
  exportPdf: 'Экспорт в PDF…',
  edit: 'Правка',
  undo: 'Отменить',
  redo: 'Повторить',
  cut: 'Вырезать',
  copy: 'Копировать',
  paste: 'Вставить',
  selectAll: 'Выделить всё',
  settings: 'Настройки',
  agent: 'Агент…',
  versioning: 'Версионирование…',
  language: 'Язык…',
  help: 'Справка',
  view: 'Вид',
  toggleDevTools: 'Инструменты разработчика',
  reload: 'Обновить',
  forceReload: 'Обновить принудительно',
  about: 'О программе',
};

/**
 * Native `Menu` labels — deliberately not `@falang/scheme`'s `I18NStore`/i18next (that machinery
 * lazy-loads locale bundles via dynamic `import()` for the *renderer*; `main` has no such loader
 * and Electron's `Menu` has to be rebuilt synchronously from a plain string anyway). Two static
 * locales are enough since `language-settings-modal.tsx`'s own `LANGUAGE_OPTIONS` only offers
 * `en`/`ru`. Electron's `role`-based items (`undo`, `close`, `about`, …) get an explicit `label`
 * here too rather than relying on Electron's own OS-locale-driven default text, so the menu
 * language always matches this app's own persisted language setting, not the OS's.
 */
export const MENU_LABELS: Record<TMenuLanguage, IMenuLabels> = { en: EN, ru: RU };

export const resolveMenuLanguage = (language: string | null): TMenuLanguage => (language === 'ru' ? 'ru' : 'en');
