import type { ICommitInfo, IVersionStore } from '@falang/versioning';
import { buildAutoVersionMessage, isSessionGap } from '@falang/versioning';
import { readSidecar, writeSidecar } from '../sidecar.js';

const SIDECAR_NAME = '.falang-versioning';

interface ISessionGapSidecar {
  lastEditedAt: string;
}

/**
 * The desktop half of the session-gap auto-version rule (ADR 0025 (private),
 * "Correction to decision 2 (2026-09-18)") — a gitignored `.falang-versioning.json` sidecar next to
 * `falang.json` (same mechanism as the Arduino app's `.falang-debug.json`, see `sidecar.ts`) stands
 * in for the workflow product's `projects.last_edited_at` column, since there's no server here to own
 * that state. `null` when the project has never recorded an edit — same as a fresh row.
 */
export const readLastEditedAt = async (projectDir: string): Promise<Date | null> => {
  const sidecar = await readSidecar<ISessionGapSidecar>(projectDir, SIDECAR_NAME);
  if (!sidecar) return null;
  const date = new Date(sidecar.lastEditedAt);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const writeLastEditedAt = async (projectDir: string, now: Date = new Date()): Promise<void> => {
  await writeSidecar<ISessionGapSidecar>(projectDir, SIDECAR_NAME, { lastEditedAt: now.toISOString() });
};

/**
 * Called by `main`'s IPC write handlers *before* applying a mutating document/folder write — mirrors
 * `VersioningService.autoVersionBeforeEdit` in `@falang/workflow-backend`: when the project's
 * previous edit was more than `gapMs` ago (or never recorded), commits the working copy as it stands
 * *before* the incoming write. Returns `null` when no gap applies, or the gap applies but nothing
 * changed since `HEAD` (the store's own dirtiness check).
 */
export const autoVersionBeforeEdit = async (
  projectDir: string,
  store: IVersionStore,
  now: Date = new Date(),
  gapMs?: number,
): Promise<ICommitInfo | null> => {
  const lastEditedAt = await readLastEditedAt(projectDir);
  if (!isSessionGap(lastEditedAt, now, gapMs)) return null;
  return store.commit({ kind: 'auto', message: buildAutoVersionMessage(now) });
};

/** Records `now` as the project's last-edit time — called after a mutating write succeeds. */
export const markEdited = async (projectDir: string, now: Date = new Date()): Promise<void> => {
  await writeLastEditedAt(projectDir, now);
};
