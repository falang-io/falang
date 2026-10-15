// oxlint-disable max-lines, require-await, no-promise-executor-return, no-await-expression-member, no-non-null-assertion, no-empty-function, no-undefined, consistent-type-imports, no-var-requires, prefer-module, prefer-event-target, consistent-function-scoping, init-declarations, no-useless-undefined -- test scaffolding: fake electron/BrowserWindow stand-ins, timer waits and loose fixtures read better with these stylistic rules off
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '../shared/ipc-channels.js';

const { ipc } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: Emitter } = require('node:events') as typeof import('node:events');
  return { ipc: new Emitter() };
});
vi.mock('electron', () => ({ ipcMain: ipc }));

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

  it('closed removes the ack listener', () => {
    const win = setup();
    expect(ipc.listenerCount(IPC.appFlushBeforeCloseComplete)).toBe(1);
    win.emit('closed');
    expect(ipc.listenerCount(IPC.appFlushBeforeCloseComplete)).toBe(0);
  });
});
