import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC } from '../shared/ipc-channels.js';
import { listRecentProjects } from './recent-projects.js';
import { getLanguage } from './settings.js';
import { MENU_LABELS, resolveMenuLanguage } from './menu-labels.js';

export const buildApplicationMenu = async (mainWindow: BrowserWindow): Promise<void> => {
  const [recentProjects, language] = await Promise.all([listRecentProjects(), getLanguage()]);
  const l = MENU_LABELS[resolveMenuLanguage(language)];

  const fileMenu: MenuItemConstructorOptions = {
    label: l.file,
    submenu: [
      {
        label: l.newProject,
        accelerator: 'CmdOrCtrl+N',
        click: () => mainWindow.webContents.send(IPC.menuNewProject),
      },
      {
        label: l.openProject,
        accelerator: 'CmdOrCtrl+O',
        click: () => mainWindow.webContents.send(IPC.menuOpenProject),
      },
      {
        label: l.recentProjects,
        submenu:
          recentProjects.length === 0
            ? [{ label: l.noRecentProjects, enabled: false }]
            : recentProjects.map((project) => ({
                label: project.name,
                click: () => mainWindow.webContents.send(IPC.menuOpenProject, project.path),
              })),
      },
      { type: 'separator' },
      {
        label: l.save,
        accelerator: 'CmdOrCtrl+S',
        click: () => mainWindow.webContents.send(IPC.menuSaveDocument),
      },
      { type: 'separator' },
      {
        role: process.platform === 'darwin' ? 'close' : 'quit',
        label: process.platform === 'darwin' ? l.close : l.quit,
      },
    ],
  };

  const projectMenu: MenuItemConstructorOptions = {
    label: l.project,
    submenu: [
      {
        label: l.exportConfig,
        click: () => mainWindow.webContents.send(IPC.menuOpenExportConfig),
      },
      {
        label: l.exportCode,
        accelerator: 'CmdOrCtrl+Shift+E',
        click: () => mainWindow.webContents.send(IPC.menuExportCode),
      },
      { type: 'separator' },
      // Separate from "Export Code" above (the `logic` domain's export, gated on its own
      // configuration): a `code`-only project has nothing configured there and would show an
      // irrelevant "No export targets configured" warning if the two were folded into one item.
      {
        label: l.exportCodeDocuments,
        click: () => mainWindow.webContents.send(IPC.menuExportCodeDocuments),
      },
      { type: 'separator' },
      {
        label: l.versionHistory,
        click: () => mainWindow.webContents.send(IPC.menuToggleVersionHistory),
      },
      {
        label: l.agentPanel,
        click: () => mainWindow.webContents.send(IPC.menuToggleAgent),
      },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
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
  };

  const settingsMenu: MenuItemConstructorOptions = {
    label: l.settings,
    submenu: [
      {
        label: l.agent,
        click: () => mainWindow.webContents.send(IPC.menuOpenSettings),
      },
      {
        label: l.versioning,
        click: () => mainWindow.webContents.send(IPC.menuOpenVersioningSettings),
      },
      {
        label: l.language,
        click: () => mainWindow.webContents.send(IPC.menuOpenLanguageSettings),
      },
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: l.help,
    submenu: [
      {
        label: `Falang v${app.getVersion()}`,
        enabled: false,
      },
    ],
  };

  // Dev-only: this app's menu template has no default `role: 'toggleDevTools'` item (unlike
  // Electron's own default menu), so without this the DevTools accelerator (Ctrl/Cmd+Shift+I) isn't
  // registered anywhere and there's no way to open them at all once a custom menu is set.
  const viewMenu: MenuItemConstructorOptions | null = app.isPackaged
    ? null
    : {
        label: l.view,
        submenu: [
          { role: 'toggleDevTools', label: l.toggleDevTools },
          { role: 'reload', label: l.reload },
          { role: 'forceReload', label: l.forceReload },
        ],
      };

  const appMenu: MenuItemConstructorOptions[] =
    process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [{ role: 'about', label: l.about }, { type: 'separator' }, { role: 'quit', label: l.quit }],
          },
        ]
      : [];

  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    fileMenu,
    editMenu,
    projectMenu,
    settingsMenu,
    ...(viewMenu ? [viewMenu] : []),
    helpMenu,
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
