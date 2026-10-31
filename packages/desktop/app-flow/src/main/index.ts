// oxlint-disable no-void -- fire-and-forget promises of Electron APIs are intentional here.
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IPC, type TFlowSplashState } from '../shared/ipc-channels.js';
import { openProductSignedIn } from './auto-login.js';
import { BackendProcess } from './backend-process.js';
import { resolveDataDir } from './data-dir.js';
import { buildApplicationMenu } from './menu.js';
import { pickPublicPort } from './ports.js';
import { resolveBackendCommand } from './resolve-backend-command.js';
import { readSettings, writeSettings } from './settings.js';
import { stageBackendDist } from './stage-backend-dist.js';
import type { ILocalStatus } from './status-file.js';

// out/main -> app-flow -> desktop -> packages -> repository root
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');

// Test-only: the packaged-app smoke test (scripts/release/smoke-desktop-app.ts) runs against a throwaway profile.
if (process.env.FALANG_FLOW_USER_DATA) app.setPath('userData', process.env.FALANG_FLOW_USER_DATA);

let mainWindow: BrowserWindow | null = null;
let backend: BackendProcess | null = null;
let status: ILocalStatus | null = null;
let splashState: TFlowSplashState = { kind: 'starting', text: 'Starting…' };
let quitting = false;

const setSplash = (state: TFlowSplashState): void => {
  splashState = state;
  mainWindow?.webContents.send(IPC.backendStatus, state);
};

const showError = (message: string): void => {
  setSplash({ kind: 'error', message, logTail: backend?.logTail ?? '' });
};

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#0f1b2d',
    webPreferences: { preload: path.join(import.meta.dirname, '../preload/index.mjs'), sandbox: false },
  });
  window.on('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });
  window.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    // The splash itself.
    if (url.startsWith('file:') && !status) return;
    if (status && new URL(url).origin === new URL(status.url).origin) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(path.join(import.meta.dirname, '../renderer/index.html'));
  return window;
};

const startBackend = async (): Promise<void> => {
  const dataDir = resolveDataDir(app.getPath('userData'));
  const saved = await readSettings();
  const port = await pickPublicPort(saved.port ?? null);
  await writeSettings({ port });
  let stagedBackendDist: string | null = null;
  if (app.isPackaged) {
    setSplash({ kind: 'starting', text: 'Preparing the engine (first run, may take a minute)…' });
    const began = Date.now();
    stagedBackendDist = await stageBackendDist(process.resourcesPath, dataDir, app.getVersion());
    // oxlint-disable-next-line no-console -- the staging cost is worth a log line.
    console.log(`[flow] backend-dist staged in ${Date.now() - began} ms: ${stagedBackendDist}`);
  }
  const command = resolveBackendCommand({
    stagedBackendDist,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath,
    repoRoot: REPO_ROOT,
    dataDir,
    statusFile: path.join(dataDir, 'status.json'),
    port,
  });
  backend = new BackendProcess({
    command,
    statusFile: path.join(dataDir, 'status.json'),
    onLine: (line) => {
      if (/building the client/i.test(line))
        setSplash({ kind: 'starting', text: 'Building the client (first run, about a minute)…' });
    },
    onUnexpectedExit: (message) => {
      if (quitting) return;
      dialog.showErrorBox('Falang Flow', `${message}\n\n${backend?.logTail.split('\n').slice(-15).join('\n') ?? ''}`);
      app.quit();
    },
  });
  setSplash({ kind: 'starting', text: 'Starting Temporal and the backend…' });
  status = await backend.start();
  await buildApplicationMenu(status, dataDir);
  setSplash({ kind: 'starting', text: 'Opening…' });
  if (mainWindow) await openProductSignedIn(mainWindow, status);
};

const boot = async (): Promise<void> => {
  await buildApplicationMenu(null, resolveDataDir(app.getPath('userData')));
  mainWindow = createWindow();
  try {
    await startBackend();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
};

ipcMain.handle(IPC.getBackendState, () => splashState);
ipcMain.handle(IPC.openDataFolder, () => shell.openPath(resolveDataDir(app.getPath('userData'))));
ipcMain.handle(IPC.quit, () => app.quit());

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  void app.whenReady().then(boot);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = createWindow();
    if (status) {
      const current = status;
      mainWindow.webContents.once('did-finish-load', () => {
        if (mainWindow) void openProductSignedIn(mainWindow, current);
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Stop the backend (and with it Temporal and the runners) before the process goes away.
  app.on('before-quit', (event) => {
    if (quitting || !backend) return;
    event.preventDefault();
    quitting = true;
    void backend.stop().finally(() => app.quit());
  });
} else {
  app.quit();
}
