import type { IDebugBreakpoint } from '@falang/debug';

/**
 * Breakpoints live in `DebugSessionStore` (never in a node's `meta`, see ADR 0021 (private) §3) and
 * are persisted by the host — `localStorage` keyed by project id for this client. Best-effort: a
 * private-browsing/quota failure just means breakpoints don't survive a reload, never a hard error.
 */
const storageKey = (projectId: string): string => `falang-workflow-debug-breakpoints:${projectId}`;

const isBreakpoint = (value: unknown): value is IDebugBreakpoint =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { documentId?: unknown }).documentId === 'string' &&
  typeof (value as { nodeId?: unknown }).nodeId === 'string';

export const loadPersistedBreakpoints = (projectId: string): IDebugBreakpoint[] => {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => isBreakpoint(item)) : [];
  } catch {
    return [];
  }
};

export const persistBreakpoints = (projectId: string, breakpoints: readonly IDebugBreakpoint[]): void => {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(breakpoints));
  } catch {
    // Best-effort — see the file comment above.
  }
};
