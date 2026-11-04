import { app, ipcMain, net } from 'electron';
import type { BrowserWindow } from 'electron';
import {
  checkArduinoCli,
  cleanupManagedVersions,
  execFileAsync,
  getArduinoCliSettingsFile,
  readArduinoCliSettings,
  writeArduinoCliSettings,
} from '@falang/desktop-arduino-cli';
import type { IArduinoCliSettings } from '@falang/desktop-arduino-cli';
import { reportError } from '../shared/report-error.js';
import { IPC } from '../shared/ipc-channels.js';
import type {
  IArduinoCliChangedPayload,
  IArduinoCliCheckUpdatesResult,
  IArduinoCliFullStatus,
  IArduinoCliProgress,
  IArduinoCliSettingsInput,
  TArduinoCliInstallResult,
  TArduinoCliSetSettingsResult,
} from '../shared/arduino-cli-ipc-types.js';
import { arduinoCliOperations } from './arduino-cli-operations.js';
import {
  deriveManagedStatus,
  ManagedArduinoCli,
  managedRootDir,
  mergeArduinoCliSettings,
} from './arduino-cli-managed.js';

const PROGRESS_INTERVAL_MS = 100;

const requireSettingsFile = (): string => {
  const file = getArduinoCliSettingsFile();
  if (file === null) throw new Error('The arduino-cli settings file is not configured.');
  return file;
};

/** A custom path is only accepted when that binary actually answers `version`. */
const verifyCustomPath = async (customPath: string): Promise<string | null> => {
  const outcome = await execFileAsync(customPath, ['version']);
  return outcome.ok ? null : `"${customPath}" did not run as arduino-cli: ${outcome.errorMessage ?? outcome.stderr}`;
};

/**
 * `arduino-cli:get-status` / `get-settings` / `set-settings` plus the `arduino-cli:changed` broadcast
 * (settings or busy state changed), plus the managed install / update channels. Phase 3 adds core channels.
 */
export const registerArduinoCliIpcHandlers = (getMainWindow: () => BrowserWindow | null): void => {
  const broadcast = (): void => {
    const payload: IArduinoCliChangedPayload = arduinoCliOperations.getState();
    getMainWindow()?.webContents.send(IPC.arduinoCliChanged, payload);
  };
  arduinoCliOperations.onChange(broadcast);

  let lastProgressAt = 0;
  const managed = new ManagedArduinoCli({
    settingsFile: requireSettingsFile(),
    rootDir: managedRootDir(app.getPath('userData')),
    // Electron's fetch honours the system proxy; Node's global one doesn't.
    fetch: (url, init) => net.fetch(url, init),
    platform: process.platform,
    arch: process.arch,
    underArm64Translation: app.runningUnderARM64Translation,
    runExclusive: (kind, fn) => arduinoCliOperations.runExclusive(kind, fn),
    onProgress: (progress) => {
      const now = Date.now();
      const last = typeof progress.total === 'number' && progress.received >= progress.total;
      if (!last && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
      lastProgressAt = now;
      const payload: IArduinoCliProgress = progress;
      getMainWindow()?.webContents.send(IPC.arduinoCliProgress, payload);
    },
    onChanged: broadcast,
  });

  // Startup housekeeping, never blocking: drop stale/old managed versions (a Windows file in use goes next time),
  // then the throttled once-a-day update check (managed source only; `checkUpdates` persists and broadcasts).
  // oxlint-disable-next-line no-void
  void (async () => {
    const settings = await readArduinoCliSettings(requireSettingsFile());
    await cleanupManagedVersions(managedRootDir(app.getPath('userData')), settings.managed?.version);
    await managed.checkUpdates();
  })().catch((error: unknown) => reportError('arduino-cli startup check failed', error));

  ipcMain.handle(IPC.arduinoCliGetStatus, async (): Promise<IArduinoCliFullStatus> => {
    const status = await checkArduinoCli();
    const settings = await readArduinoCliSettings(requireSettingsFile());
    return { ...status, ...arduinoCliOperations.getState(), ...deriveManagedStatus(settings) };
  });

  ipcMain.handle(
    IPC.arduinoCliInstall,
    (_event, request?: { version?: string }): Promise<TArduinoCliInstallResult> => managed.install(request?.version),
  );
  ipcMain.handle(IPC.arduinoCliCancelInstall, (): void => managed.cancelInstall());
  ipcMain.handle(
    IPC.arduinoCliCheckUpdates,
    (_event, request?: { force?: boolean }): Promise<IArduinoCliCheckUpdatesResult> =>
      managed.checkUpdates(request?.force === true),
  );

  ipcMain.handle(
    IPC.arduinoCliGetSettings,
    (): Promise<IArduinoCliSettings> => readArduinoCliSettings(requireSettingsFile()),
  );

  ipcMain.handle(
    IPC.arduinoCliSetSettings,
    async (_event, input: IArduinoCliSettingsInput): Promise<TArduinoCliSetSettingsResult> => {
      try {
        const next = mergeArduinoCliSettings(await readArduinoCliSettings(requireSettingsFile()), input);
        if (next.source === 'custom') {
          if (typeof next.customPath !== 'string' || next.customPath === '') {
            return { ok: false, message: 'Choose the arduino-cli executable.' };
          }
          const problem = await verifyCustomPath(next.customPath);
          if (problem !== null) return { ok: false, message: problem };
        }
        await writeArduinoCliSettings(requireSettingsFile(), next);
        broadcast();
        return { ok: true, settings: next };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );
};
