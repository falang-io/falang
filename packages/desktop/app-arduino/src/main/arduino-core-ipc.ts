import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { installCore } from '@falang/desktop-arduino-cli';
import { IPC } from '../shared/ipc-channels.js';
import type {
  IArduinoCoreInstallResult,
  IArduinoCoreOutputLine,
  IArduinoCoreStatus,
} from '../shared/arduino-core-ipc-types.js';
import { ArduinoCliBusyError, arduinoCliOperations } from './arduino-cli-operations.js';
import { getCoreStatus } from './core-gate.js';

let installAbort: AbortController | null = null;

/**
 * `arduino-cores:status` / `install` / `cancel-install` plus the `arduino-cores:output` line stream
 * (ADR 0074 (private) §4). Installing is exclusive with every build (`core-install` in the gate).
 */
export const registerArduinoCoreIpcHandlers = (getMainWindow: () => BrowserWindow | null): void => {
  ipcMain.handle(
    IPC.arduinoCoresStatus,
    (_event, params: { fqbn: string }): Promise<IArduinoCoreStatus> => getCoreStatus(params.fqbn),
  );

  ipcMain.handle(
    IPC.arduinoCoresInstall,
    async (_event, params: { fqbn: string }): Promise<IArduinoCoreInstallResult> => {
      try {
        const status = await getCoreStatus(params.fqbn);
        if (status.platformId === null) return { ok: false, message: `Not a valid board: ${params.fqbn}` };
        const { platformId, packageIndexUrl } = status;
        return await arduinoCliOperations.runExclusive('core-install', async () => {
          const abort = new AbortController();
          installAbort = abort;
          try {
            return await installCore({
              platformId,
              additionalUrls: typeof packageIndexUrl === 'string' ? [packageIndexUrl] : [],
              signal: abort.signal,
              onOutput: (line, stream) => {
                const payload: IArduinoCoreOutputLine = { line, stream };
                getMainWindow()?.webContents.send(IPC.arduinoCoresOutput, payload);
              },
            });
          } finally {
            installAbort = null;
          }
        });
      } catch (error) {
        if (error instanceof ArduinoCliBusyError) return { ok: false, message: error.message };
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(IPC.arduinoCoresCancelInstall, (): void => {
    installAbort?.abort();
  });
};
