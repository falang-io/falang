// oxlint-disable no-void -- fire-and-forget promises of Electron APIs are intentional here.
import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { getLanguage } from './settings.js';
import { MENU_LABELS, resolveMenuLanguage } from './menu-labels.js';
import type { ILocalStatus } from './status-file.js';

export const DOCUMENTATION_URL = 'https://docs.falang.io';

export const buildApplicationMenu = async (status: ILocalStatus | null, dataDir: string): Promise<void> => {
  const l = MENU_LABELS[resolveMenuLanguage(await getLanguage(), app.getLocale())];
  const template: MenuItemConstructorOptions[] = [
    {
      label: l.file,
      submenu: [
        {
          label: l.openInBrowser,
          enabled: status !== null,
          click: () => {
            if (status) void shell.openExternal(status.url);
          },
        },
        {
          label: l.openTemporalUi,
          enabled: Boolean(status?.temporalUiUrl),
          click: () => {
            if (status?.temporalUiUrl) void shell.openExternal(status.temporalUiUrl);
          },
        },
        { label: l.showDataFolder, click: () => void shell.openPath(dataDir) },
        { type: 'separator' },
        { role: 'quit', label: l.quit },
      ],
    },
    {
      label: l.edit,
      submenu: [
        { role: 'undo', label: l.undo },
        { role: 'redo', label: l.redo },
        { type: 'separator' },
        { role: 'cut', label: l.cut },
        { role: 'copy', label: l.copy },
        { role: 'paste', label: l.paste },
        { role: 'selectAll', label: l.selectAll },
      ],
    },
    {
      label: l.view,
      submenu: [
        { role: 'reload', label: l.reload },
        { role: 'forceReload', label: l.forceReload },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' as const, label: l.toggleDevTools }]),
      ],
    },
    {
      label: l.help,
      submenu: [
        { label: l.documentation, click: () => void shell.openExternal(DOCUMENTATION_URL) },
        { role: 'about', label: l.about },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
