import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import { DRIVER_BUNDLE_FILE_SUFFIX, parseDriverBundle } from '@falang/desktop-arduino-dto';
import { IPC } from '../../shared/ipc-channels.js';
import type {
  IDriverAdoptResult,
  IDriverCreateFromTemplateResult,
  IDriverListPayload,
  IDriverValidationResult,
  TDriverDeleteResult,
  TDriverEditScope,
  TDriverFileResult,
  TDriverImportFileResult,
  TDriverScope,
  IDriverBundle,
} from '../../shared/driver-ipc-types.js';
import type { IDriverRuntime } from './driver-runtime.js';

const requireProjectDir = (runtime: IDriverRuntime): string => {
  const dir = runtime.registry.getProjectDir();
  if (!dir) throw new Error('No project is open');
  return dir;
};

/** The `drivers:*` handlers (ADR 0054 (private) §3) — thin: dialogs and `shell` here, the logic in `driver-service.ts`. */
export const registerDriverIpcHandlers = (runtime: IDriverRuntime, getMainWindow: () => BrowserWindow | null): void => {
  const { service } = runtime;
  ipcMain.handle(IPC.driversList, (): IDriverListPayload => service.list());
  ipcMain.handle(
    IPC.driversGet,
    (_event, id: string, scope: TDriverScope): Promise<IDriverBundle> => service.get(id, scope),
  );
  ipcMain.handle(
    IPC.driversValidate,
    (_event, bundle: unknown, scope: TDriverEditScope): Promise<IDriverValidationResult> =>
      service.validate(bundle, scope),
  );
  ipcMain.handle(
    IPC.driversSave,
    (_event, bundle: unknown, scope: TDriverEditScope): Promise<IDriverValidationResult> => service.save(bundle, scope),
  );
  ipcMain.handle(
    IPC.driversDelete,
    (_event, id: string, scope: TDriverEditScope): Promise<TDriverDeleteResult> => service.delete(id, scope),
  );
  ipcMain.handle(IPC.driversSaveToLibrary, (_event, id: string) => service.saveToLibrary(id));
  ipcMain.handle(IPC.driversAddFromLibrary, (_event, id: string) => service.addFromLibrary(id));
  ipcMain.handle(IPC.driversReplaceWithLibrary, (_event, id: string) => service.replaceWithLibrary(id));
  ipcMain.handle(IPC.driversImportFolder, (_event, dir: string, scope: TDriverEditScope) =>
    service.importFolder(dir, scope),
  );
  // `shell.openPath` resolves to an error message, or '' on success.
  ipcMain.handle(IPC.driversOpenFolder, async (_event, id: string, scope: TDriverScope): Promise<string | null> => {
    const error = await shell.openPath(service.driverDir(id, scope));
    return error === '' ? null : error;
  });
  ipcMain.handle(
    IPC.driversCreateFromTemplate,
    (_event, id: string, label: string): Promise<IDriverCreateFromTemplateResult> =>
      service.createFromTemplate(id, label),
  );
  ipcMain.handle(
    IPC.driversAdoptReferenced,
    (): Promise<IDriverAdoptResult> => service.adoptReferenced(requireProjectDir(runtime)),
  );

  ipcMain.handle(
    IPC.driversExportBundle,
    async (_event, id: string, scope: TDriverScope): Promise<TDriverFileResult> => {
      const window = getMainWindow();
      if (!window) return { canceled: true };
      const bundle = await service.get(id, scope);
      const save = await dialog.showSaveDialog(window, {
        defaultPath: path.join(app.getPath('documents'), `${id}${DRIVER_BUNDLE_FILE_SUFFIX}`),
        filters: [{ name: 'Falang driver', extensions: ['json'] }],
      });
      if (save.canceled || !save.filePath) return { canceled: true };
      await fs.writeFile(save.filePath, `${JSON.stringify(bundle, null, 2)}\n`);
      return { canceled: false, path: save.filePath };
    },
  );
  ipcMain.handle(
    IPC.driversImportBundleFile,
    async (_event, scope: TDriverEditScope): Promise<TDriverImportFileResult> => {
      const window = getMainWindow();
      if (!window) return { canceled: true };
      const open = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [{ name: 'Falang driver', extensions: ['json'] }],
      });
      const file = open.filePaths[0];
      if (open.canceled || !file) return { canceled: true };
      let raw: unknown = null;
      try {
        raw = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          canceled: false,
          validation: {
            ok: false,
            errors: [{ stage: 'schema', message: `not a JSON file: ${message}` }],
            warnings: [],
          },
        };
      }
      const validation = await service.save(raw, scope);
      let id = '';
      try {
        id = parseDriverBundle(raw).config.id;
      } catch {
        // validation already reported why
      }
      return { canceled: false, validation, ...(id ? { id } : {}) };
    },
  );
};
