export type TMenuLanguage = 'en' | 'ru';

interface IMenuLabels {
  file: string;
  openInBrowser: string;
  openTemporalUi: string;
  showDataFolder: string;
  quit: string;
  close: string;
  edit: string;
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  selectAll: string;
  view: string;
  reload: string;
  forceReload: string;
  toggleDevTools: string;
  help: string;
  documentation: string;
  about: string;
}

const EN: IMenuLabels = {
  file: 'File',
  openInBrowser: 'Open in Browser',
  openTemporalUi: 'Open Temporal UI',
  showDataFolder: 'Show Data Folder',
  quit: 'Quit',
  close: 'Close',
  edit: 'Edit',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select All',
  view: 'View',
  reload: 'Reload',
  forceReload: 'Force Reload',
  toggleDevTools: 'Toggle Developer Tools',
  help: 'Help',
  documentation: 'Documentation',
  about: 'About Falang Flow',
};

const RU: IMenuLabels = {
  file: 'Файл',
  openInBrowser: 'Открыть в браузере',
  openTemporalUi: 'Открыть Temporal UI',
  showDataFolder: 'Показать папку с данными',
  quit: 'Выход',
  close: 'Закрыть',
  edit: 'Правка',
  undo: 'Отменить',
  redo: 'Повторить',
  cut: 'Вырезать',
  copy: 'Копировать',
  paste: 'Вставить',
  selectAll: 'Выделить всё',
  view: 'Вид',
  reload: 'Перезагрузить',
  forceReload: 'Перезагрузить принудительно',
  toggleDevTools: 'Инструменты разработчика',
  help: 'Справка',
  documentation: 'Документация',
  about: 'О программе Falang Flow',
};

export const MENU_LABELS: Record<TMenuLanguage, IMenuLabels> = { en: EN, ru: RU };

/** The saved language, else the OS locale (`ru*` -> Russian), else English. */
export const resolveMenuLanguage = (saved: string | null, osLocale = ''): TMenuLanguage => {
  const language = saved ?? osLocale;
  return language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
};
