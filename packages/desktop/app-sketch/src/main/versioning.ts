import {
  autoVersionBeforeEdit,
  createGitVersionStore,
  DEFAULT_AUTO_VERSION_GAP_HOURS,
  markEdited,
} from '@falang/desktop-project-fs';
import type { IVersionStore } from '@falang/versioning';
import { reportError } from '../shared/report-error.js';
import { getVersioningSettings } from './settings.js';

/**
 * One `IVersionStore` per open project directory, per ADR 0025 (private)
 * (package E2) — cached so every IPC call for the same project reuses the same `GitVersionStore`
 * instance (and therefore the same per-store serial queue, see `@falang/desktop-project-fs`'s
 * `serial-queue.ts`) rather than racing two independent queues against the same working directory.
 * `getVersioningSettings` is passed by reference, not called once here, so a live "Settings →
 * Versioning…" change is picked up by the very next operation without recreating the store.
 */
const stores = new Map<string, IVersionStore>();

export const getVersionStore = (projectDir: string): IVersionStore => {
  const existing = stores.get(projectDir);
  if (existing) return existing;
  const store = createGitVersionStore(projectDir, getVersioningSettings);
  stores.set(projectDir, store);
  return store;
};

/**
 * The session-gap auto-version rule (ADR 0025 (private), "Correction to
 * decision 2 (2026-09-18)") wrapped around one mutating document/folder write — mirrors
 * `SessionGapAutoVersionInterceptor` in `@falang/workflow-backend`: auto-commits the pre-edit
 * working copy first (only when the project's previous edit was more than `autoVersionGapHours`
 * ago, or never recorded), then runs `write()`, then records "now" as the project's last-edit time.
 * Errors from the auto-commit half must not block the write itself, matching the interceptor's own
 * "log and continue" rule.
 */
export const withAutoVersion = async <T>(projectDir: string, write: () => Promise<T>): Promise<T> => {
  const store = getVersionStore(projectDir);
  try {
    const settings = await getVersioningSettings();
    const gapMs = (settings.autoVersionGapHours ?? DEFAULT_AUTO_VERSION_GAP_HOURS) * 60 * 60 * 1000;
    await autoVersionBeforeEdit(projectDir, store, new Date(), gapMs);
  } catch (error) {
    reportError('autoVersionBeforeEdit failed', error);
  }
  const result = await write();
  await markEdited(projectDir);
  return result;
};
