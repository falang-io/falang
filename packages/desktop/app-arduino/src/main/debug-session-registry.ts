import { monitorPort } from '@falang/desktop-arduino-cli';
import type { IDebugBreakpoint, TDebugEvent, TDebugResumeMode } from '@falang/debug';
import type { IStartDebugSessionParams } from '../shared/start-debug-session-params.js';
import { SerialDebugSession } from './serial-debug-session.js';

export type { IStartDebugSessionParams } from '../shared/start-debug-session-params.js';

/**
 * One active `SerialDebugSession` at a time — only one board can be attached to a given serial port
 * at once anyway, and the app has no concept of multiple simultaneous debug targets (matches the
 * workflow product's own "starting a Run/Debug terminates whatever the dev stand was already
 * running" posture, simplified here to module-level state since there's no dev pod to terminate).
 * `ipc-handlers.ts` is the only caller — kept as its own module so `serial-debug-session.ts` stays
 * unit-testable without ever importing Electron.
 */
let activeSession: SerialDebugSession | null = null;

export const startDebugSession = (params: IStartDebugSessionParams, onEvent: (event: TDebugEvent) => void): void => {
  activeSession?.stop().catch(() => {
    // Best-effort — the previous session's port may already be gone.
  });
  const monitor = monitorPort({ port: params.port });
  activeSession = new SerialDebugSession({
    monitor,
    debugMap: params.debugMap,
    breakpoints: params.breakpoints,
    pauseOnEntry: params.pauseOnEntry,
    onEvent,
  });
};

export const setDebugBreakpoints = (breakpoints: readonly IDebugBreakpoint[]): Promise<void> =>
  activeSession?.setBreakpoints(breakpoints) ?? Promise.resolve();

export const resumeDebugSession = (mode: TDebugResumeMode): Promise<void> =>
  activeSession?.resume(mode) ?? Promise.resolve();

export const stopDebugSession = async (): Promise<void> => {
  await activeSession?.stop();
  activeSession = null;
};
