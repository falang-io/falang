import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC } from '../shared/ipc-channels.js';
import { listRecentProjects } from './recent-projects.js';
import { getLanguage } from './settings.js';
import { MENU_LABELS, resolveMenuLanguage } from './menu-labels.js';
import { getMenuContext, getProjectMenuAvailability } from './menu-context.js';

export const buildApplicationMenu = async (mainWindow: BrowserWindow): Promise<void> => {
  const [recentProjects, language] = await Promise.all([listRecentProjects(), getLanguage()]);
  const l = MENU_LABELS[resolveMenuLanguage(language)];
  const available = getProjectMenuAvailability(getMenuContext().projectType);

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
        role: process.platform === 'darwin' ? 'close' : 'quit',
        label: process.platform === 'darwin' ? l.close : l.quit,
      },
    ],
  };

  const projectMenu: MenuItemConstructorOptions = {
    label: l.project,
    visible: available.hasProject,
    // Items that need an open project are hidden (not disabled) while none is open — the renderer reports the open
    // project's type (`IPC.menuSetContext`) and `main` rebuilds the menu.
    submenu: [
      {
        label: l.exportConfig,
        visible: available.logicExport,
        click: () => mainWindow.webContents.send(IPC.menuOpenExportConfig),
      },
      {
        label: l.exportCode,
        accelerator: 'CmdOrCtrl+Shift+E',
        visible: available.logicExport,
        click: () => mainWindow.webContents.send(IPC.menuExportCode),
      },
      {
        label: l.exportPdf,
        visible: available.hasProject,
        click: () => mainWindow.webContents.send(IPC.menuExportPdf),
      },
      { type: 'separator', visible: available.hasProject },
      // Separate from "Export Code" above (the `logic` domain's export, gated on its own
      // configuration): a `simple-code`-only project has nothing configured there.
      {
        label: l.exportCodeDocuments,
        visible: available.codeExport,
        click: () => mainWindow.webContents.send(IPC.menuExportCodeDocuments),
      },
      { type: 'separator', visible: available.codeExport },
      {
        label: l.versionHistory,
        visible: available.hasProject,
        click: () => mainWindow.webContents.send(IPC.menuToggleVersionHistory),
      },
      {
        label: l.agentPanel,
        visible: available.hasProject,
        click: () => mainWindow.webContents.send(IPC.menuToggleAgent),
      },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: l.edit,
    submenu: [
      // Custom items, not `role: 'undo'/'redo'`: the renderer decides between a text editor's own undo and the active
      // scheme's history (`installUndoRedo` in `@falang/desktop-agent-host`). `registerAccelerator: false` keeps the
      // keystroke out of the menu (it reaches the page, where the focused editor or the canvas handler takes it) so one
      // keypress is never undone twice; the accelerator is shown for information only.
      {
        label: l.undo,
        accelerator: 'CmdOrCtrl+Z',
        registerAccelerator: false,
        click: () => mainWindow.webContents.send(IPC.menuUndo),
      },
      {
        label: l.redo,
        accelerator: process.platform === 'darwin' ? 'Shift+Cmd+Z' : 'Ctrl+Y',
        registerAccelerator: false,
        click: () => mainWindow.webContents.send(IPC.menuRedo),
      },
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
