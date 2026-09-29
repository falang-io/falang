import type { IDebugBreakpoint } from '@falang/debug';

/**
 * Breakpoints live in `DebugSessionStore` (never in a node's `meta`, see ADR 0021 (private) §3) and
 * are persisted by the host — a `.falang-debug.json` sidecar next to `falang.json` for this desktop
 * app (via `@falang/desktop-project-fs`'s generic `readSidecar`/`writeSidecar`, reached over IPC since
 * only `main` touches the filesystem). Best-effort: a failed read/write just means breakpoints don't
 * survive a reload, never a hard error — same posture the workflow client's `localStorage` version has.
 */
export const loadPersistedBreakpoints = async (projectDir: string): Promise<IDebugBreakpoint[]> => {
  try {
    return (await globalThis.falang.debug.readBreakpoints(projectDir)) ?? [];
  } catch {
    return [];
  }
};

export const persistBreakpoints = (projectDir: string, breakpoints: readonly IDebugBreakpoint[]): void => {
  globalThis.falang.debug.writeBreakpoints(projectDir, [...breakpoints]).catch(() => {
    // Best-effort — see the file comment above.
  });
};
