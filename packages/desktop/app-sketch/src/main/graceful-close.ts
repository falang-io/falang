import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc-channels.js';

/**
 * Safety net if the renderer never acks — it crashed, hasn't finished loading, or no project was
 * ever opened so nothing ever subscribed to `IPC.appFlushBeforeClose` at all — the window closes
 * anyway rather than becoming permanently un-closable.
 */
const FLUSH_TIMEOUT_MS = 3000;

/**
 * Closing the window (the OS close button, Cmd/Ctrl+W, File → Close/Quit) otherwise tears down the
 * renderer process immediately, mid-flight of the editor's own debounced autosave (`SAVE_DEBOUNCE_MS`
 * in `desktop-project-store.ts`) — an edit made in the last ~500ms before closing would be silently
 * lost, with no error shown anywhere (found live, in the sibling `app-arduino`: a user edited a
 * document and it never reached disk). This intercepts the first close attempt, asks the renderer to
 * flush every pending save and await it (`DesktopProjectStore.flushPendingSaves`), then lets the
 * *next* close attempt through.
 */
export const installGracefulClose = (window: BrowserWindow): void => {
  let readyToClose = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const proceedToClose = (): void => {
    if (readyToClose) return;
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = null;
    readyToClose = true;
    window.close();
  };

  ipcMain.on(IPC.appFlushBeforeCloseComplete, proceedToClose);

  window.on('close', (event) => {
    if (readyToClose) return;
    event.preventDefault();
    window.webContents.send(IPC.appFlushBeforeClose);
    timeoutHandle = setTimeout(proceedToClose, FLUSH_TIMEOUT_MS);
  });

  window.on('closed', () => ipcMain.off(IPC.appFlushBeforeCloseComplete, proceedToClose));
};
