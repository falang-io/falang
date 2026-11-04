import { app, ipcMain, type BrowserWindow } from 'electron';
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
 *
 * Cancelling that first close also cancels an `app.quit()` in progress (Cmd+Q, File → Quit): Electron aborts a quit
 * whose window refuses to close. On Linux/Windows `window-all-closed` quits anyway once the window is gone, but on
 * macOS it doesn't (the app stays in the Dock by convention), so Cmd+Q left a running app with no window. A quit seen
 * before the flush is therefore resumed after it.
 */
export const installGracefulClose = (window: BrowserWindow): void => {
  let readyToClose = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let quitRequested = false;
  const onBeforeQuit = (): void => {
    quitRequested = true;
  };

  const proceedToClose = (): void => {
    if (readyToClose) return;
    if (timeoutHandle) clearTimeout(timeoutHandle);
    timeoutHandle = null;
    readyToClose = true;
    window.close();
    if (quitRequested) app.quit();
  };

  ipcMain.on(IPC.appFlushBeforeCloseComplete, proceedToClose);
  app.on('before-quit', onBeforeQuit);

  window.on('close', (event) => {
    if (readyToClose) return;
    event.preventDefault();
    window.webContents.send(IPC.appFlushBeforeClose);
    timeoutHandle = setTimeout(proceedToClose, FLUSH_TIMEOUT_MS);
  });

  window.on('closed', () => {
    ipcMain.off(IPC.appFlushBeforeCloseComplete, proceedToClose);
    app.off('before-quit', onBeforeQuit);
  });
};
