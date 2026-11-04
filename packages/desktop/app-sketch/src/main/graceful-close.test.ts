// oxlint-disable max-lines, require-await, no-promise-executor-return, no-await-expression-member, no-non-null-assertion, no-empty-function, no-undefined, consistent-type-imports, no-var-requires, prefer-module, prefer-event-target, consistent-function-scoping, init-declarations, no-useless-undefined -- test scaffolding: fake electron/BrowserWindow stand-ins, timer waits and loose fixtures read better with these stylistic rules off
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '../shared/ipc-channels.js';

const { ipc, electronApp } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: Emitter } = require('node:events') as typeof import('node:events');
  /** An `app` stand-in: `quit()` emits `before-quit`, like Electron's. */
  const fakeApp = Object.assign(new Emitter(), { quit: vi.fn() });
  fakeApp.quit.mockImplementation(() => fakeApp.emit('before-quit'));
  return { ipc: new Emitter(), electronApp: fakeApp };
});
vi.mock('electron', () => ({ ipcMain: ipc, app: electronApp }));

import { installGracefulClose } from './graceful-close.js';

/** A `BrowserWindow` stand-in: `close()` emits `close` with a cancellable event like Electron does. */
class FakeWindow extends EventEmitter {
  readonly send = vi.fn();
  readonly webContents = { send: this.send };
  closedForReal = 0;
  close(): void {
    const event = {
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
    this.emit('close', event);
    if (!event.prevented) {
      this.closedForReal += 1;
      this.emit('closed');
    }
  }
}

describe('installGracefulClose (ADR 0029 (private), "edits lost on window close")', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ipc.removeAllListeners();
    electronApp.removeAllListeners();
    electronApp.quit.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const win = new FakeWindow();
    installGracefulClose(win as never);
    return win;
  };

  it('the first close is cancelled and the renderer is asked to flush', () => {
    const win = setup();
    win.close();
    expect(win.closedForReal).toBe(0);
    expect(win.send).toHaveBeenCalledWith(IPC.appFlushBeforeClose);
  });

  it('the renderer ack lets the window close, exactly once', () => {
    const win = setup();
    win.close();
    ipc.emit(IPC.appFlushBeforeCloseComplete);
    expect(win.closedForReal).toBe(1);
    // A late timeout after the ack must not close again.
    vi.advanceTimersByTime(10_000);
    expect(win.closedForReal).toBe(1);
  });

  it('without an ack the window closes after 3 seconds, not before', () => {
    const win = setup();
    win.close();
    vi.advanceTimersByTime(2999);
    expect(win.closedForReal).toBe(0);
    vi.advanceTimersByTime(1);
    expect(win.closedForReal).toBe(1);
  });

  it('a second close attempt after the ack is not intercepted (no second flush request)', () => {
    const win = setup();
    win.close();
    ipc.emit(IPC.appFlushBeforeCloseComplete);
    win.close();
    expect(win.send).toHaveBeenCalledTimes(1);
    expect(win.closedForReal).toBe(2);
  });

  it('closed removes the ack and before-quit listeners', () => {
    const win = setup();
    expect(ipc.listenerCount(IPC.appFlushBeforeCloseComplete)).toBe(1);
    expect(electronApp.listenerCount('before-quit')).toBe(1);
    win.emit('closed');
    expect(ipc.listenerCount(IPC.appFlushBeforeCloseComplete)).toBe(0);
    expect(electronApp.listenerCount('before-quit')).toBe(0);
  });

  it('a quit cancelled by the flush is resumed after the ack (macOS keeps a windowless app alive otherwise)', () => {
    const win = setup();
    electronApp.quit();
    win.close();
    expect(win.closedForReal).toBe(0);
    ipc.emit(IPC.appFlushBeforeCloseComplete);
    expect(win.closedForReal).toBe(1);
    expect(electronApp.quit).toHaveBeenCalledTimes(2);
  });

  it('a plain window close does not quit the app', () => {
    const win = setup();
    win.close();
    ipc.emit(IPC.appFlushBeforeCloseComplete);
    expect(electronApp.quit).not.toHaveBeenCalled();
  });
});
