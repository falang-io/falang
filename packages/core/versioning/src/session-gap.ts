/**
 * The session-gap auto-version rule (ADR 0025 (private), "Correction to
 * decision 2 (2026-09-18, from the user)"): an `auto` commit is created when a new edit arrives
 * after a gap of more than `AUTO_VERSION_GAP_MS` since the project's previous edit, snapshotting
 * the working copy *as it stood before that new edit* — i.e. the state the previous editing
 * session ended in. No client-side timers, no `beforeunload` beacon — this check runs on the
 * receiving side of every write (a NestJS interceptor in the workflow product, the `main`-process
 * IPC write handlers on desktop).
 */
export const DEFAULT_AUTO_VERSION_GAP_MS = 3 * 60 * 60 * 1000;

/**
 * `null` (no edit ever recorded) always counts as "after a gap" — the very first edit of a
 * project that has content but no `HEAD` yet also commits the pre-edit state.
 */
export const isSessionGap = (
  lastEditedAt: string | Date | null,
  now: Date | number,
  gapMs: number = DEFAULT_AUTO_VERSION_GAP_MS,
): boolean => {
  if (lastEditedAt === null) {
    return true;
  }
  const lastEditedAtMs = lastEditedAt instanceof Date ? lastEditedAt.getTime() : new Date(lastEditedAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : now;
  return nowMs - lastEditedAtMs > gapMs;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** `Auto-save YYYY-MM-DD HH:mm`, local time. */
export const buildAutoVersionMessage = (now: Date): string => {
  const year = now.getFullYear();
  const month = pad2(now.getMonth() + 1);
  const day = pad2(now.getDate());
  const hours = pad2(now.getHours());
  const minutes = pad2(now.getMinutes());
  return `Auto-save ${year}-${month}-${day} ${hours}:${minutes}`;
};
