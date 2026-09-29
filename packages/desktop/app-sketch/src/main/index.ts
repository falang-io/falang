import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { registerIpcHandlers } from './ipc-handlers.js';
import { buildApplicationMenu } from './menu.js';
import { reportError } from '../shared/report-error.js';
import { stopProjectWatcher } from './project-watcher-state.js';
import { installGracefulClose } from './graceful-close.js';

let mainWindow: BrowserWindow | null = null;

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  installGracefulClose(window);

  window.on('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
    // Only one project/window in this app, so a closed window means the watched project (if any)
    // is no longer being edited anywhere in this process — stop pushing it events into the void.
    stopProjectWatcher();
  });

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }

  return window;
};

app.whenReady().then(async () => {
  mainWindow = createWindow();
  registerIpcHandlers(
    () => mainWindow,
    () => {
      if (mainWindow)
        buildApplicationMenu(mainWindow).catch((error: unknown) => reportError('Failed to rebuild menu', error));
    },
  );
  await buildApplicationMenu(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
