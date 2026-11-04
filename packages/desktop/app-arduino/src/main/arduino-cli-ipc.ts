import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import {
  checkArduinoCli,
  execFileAsync,
  getArduinoCliSettingsFile,
  readArduinoCliSettings,
  writeArduinoCliSettings,
} from '@falang/desktop-arduino-cli';
import type { IArduinoCliSettings } from '@falang/desktop-arduino-cli';
import { IPC } from '../shared/ipc-channels.js';
import type {
  IArduinoCliChangedPayload,
  IArduinoCliFullStatus,
  TArduinoCliSetSettingsResult,
} from '../shared/arduino-cli-ipc-types.js';
import { arduinoCliOperations } from './arduino-cli-operations.js';

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
 * (settings or busy state changed). Later phases add install / check-updates / core channels here.
 */
export const registerArduinoCliIpcHandlers = (getMainWindow: () => BrowserWindow | null): void => {
  const broadcast = (): void => {
    const payload: IArduinoCliChangedPayload = arduinoCliOperations.getState();
    getMainWindow()?.webContents.send(IPC.arduinoCliChanged, payload);
  };
  arduinoCliOperations.onChange(broadcast);

  ipcMain.handle(IPC.arduinoCliGetStatus, async (): Promise<IArduinoCliFullStatus> => {
    const status = await checkArduinoCli();
    return { ...status, ...arduinoCliOperations.getState() };
  });

  ipcMain.handle(
    IPC.arduinoCliGetSettings,
    (): Promise<IArduinoCliSettings> => readArduinoCliSettings(requireSettingsFile()),
  );

  ipcMain.handle(
    IPC.arduinoCliSetSettings,
    async (_event, next: IArduinoCliSettings): Promise<TArduinoCliSetSettingsResult> => {
      try {
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
