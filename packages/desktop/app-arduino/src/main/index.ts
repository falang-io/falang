import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { registerIpcHandlers } from './ipc-handlers.js';
import { buildApplicationMenu } from './menu.js';
import { reportError } from '../shared/report-error.js';
import { loadDriverRegistry, type IDriverRegistry } from './drivers/driver-registry.js';
import { stopProjectWatcher } from './project-watcher-state.js';
import { installGracefulClose } from './graceful-close.js';

/** Bundled drivers ship under this app's own `resources/drivers/` (see `electron-builder.yml`'s `files`/`asarUnpack`); `import.meta.dirname` is always `<app>/out/main` in both dev and packaged builds (electron-vite compiles `main` the same way for either), so this one relative path works unchanged in both. */
const bundledDriversDir = (): string => join(import.meta.dirname, '../../resources/drivers');
/** A user's own custom drivers (ADR 0023 (private)'s Phase C) — installed once per app install, not per project, matching the ADR's "Registration mechanism" note. */
const userDriversDir = (): string => join(app.getPath('userData'), 'drivers');

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
  // Loaded and registered *before* `createWindow()` starts loading the renderer bundle — the renderer
  // calls `falang.drivers.list()` before its first render (see `renderer/src/main.tsx`), which would
  // race an unregistered `drivers:list` IPC handler otherwise.
  const driverRegistry: IDriverRegistry = await loadDriverRegistry(bundledDriversDir(), userDriversDir());
  for (const error of driverRegistry.errors) {
    reportError(`Failed to load driver from ${error.dir}`, new Error(error.message));
  }

  registerIpcHandlers(
    () => mainWindow,
    () => {
      if (mainWindow)
        buildApplicationMenu(mainWindow).catch((error: unknown) => reportError('Failed to rebuild menu', error));
    },
    driverRegistry,
  );

  mainWindow = createWindow();
  await buildApplicationMenu(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
