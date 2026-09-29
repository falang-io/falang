import { reaction, type IReactionDisposer } from 'mobx';
import type { IProjectDocument } from '@falang/dto';
import { DebugSessionStore } from '@falang/scheme';
import { ArduinoDebugAdapter } from './arduino-debug-adapter.js';
import { loadPersistedBreakpoints, persistBreakpoints } from './debug-breakpoints-storage.js';
import { reportError } from '../../shared/report-error.js';

export interface ICreatedArduinoDebugSession {
  readonly session: DebugSessionStore;
  readonly dispose: () => void;
}

/**
 * Builds the one project-level `DebugSessionStore` `ArduinoProjectStore` shares across every open
 * scheme's `DebuggerModule` (ADR 0021 (private) §3/§6) — pulled out of `ArduinoProjectStore` itself
 * purely to keep that class under the repo's line-count lint budget, not because this wiring is
 * reusable elsewhere.
 */
export const createArduinoDebugSession = (
  projectDir: string,
  getDocuments: () => readonly IProjectDocument[],
): ICreatedArduinoDebugSession => {
  const session = new DebugSessionStore(new ArduinoDebugAdapter({ getProjectDir: () => projectDir, getDocuments }));
  loadPersistedBreakpoints(projectDir)
    .then((breakpoints) => session.replaceBreakpoints(breakpoints))
    .catch((error: unknown) => reportError('Failed to load persisted breakpoints', error));
  const persistBreakpointsDisposer: IReactionDisposer = reaction(
    () => session.breakpointList,
    (breakpoints) => persistBreakpoints(projectDir, breakpoints),
  );
  return {
    session,
    dispose: () => {
      persistBreakpointsDisposer();
      session.dispose();
    },
  };
};
