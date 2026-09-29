import type { IDebugBreakpoint, IDebugMap } from '@falang/debug';

/** The renderer→main `debug:start` IPC payload (ADR 0021 (private) §6) — kept in `shared/` (not `main/debug-session-registry.ts`) so `preload/index.ts` can type it without importing anything from `main/`. */
export interface IStartDebugSessionParams {
  readonly port: string;
  readonly debugMap: IDebugMap;
  readonly breakpoints: readonly IDebugBreakpoint[];
  readonly pauseOnEntry: boolean;
}
