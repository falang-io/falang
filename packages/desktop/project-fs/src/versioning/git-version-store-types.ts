/**
 * Desktop-app-wide git versioning settings (`0025`'s "Git specifics (desktop)" — author identity
 * plus the private/enclosing repo-mode toggle, decision 3). Read fresh by `createGitVersionStore`'s
 * `getOptions` callback on every operation, since the host's own settings store can change at
 * runtime (e.g. a "Settings → Versioning…" dialog) without the app restarting.
 */
export interface IGitVersioningOptions {
  repoMode: 'private' | 'enclosing';
  author: { name: string; email: string };
  /**
   * The session-gap auto-version window, in hours (ADR 0025 (private),
   * "Correction to decision 2 (2026-09-18)") — the desktop-settings equivalent of the workflow
   * product's `AUTO_VERSION_GAP_MS` env var. Read by each app's `main/versioning.ts`, not by
   * `@falang/desktop-project-fs` itself (this package only defines the shape). Optional (falls back
   * to `DEFAULT_AUTO_VERSION_GAP_HOURS`) so a `settings.json` persisted before this field existed
   * still parses.
   */
  autoVersionGapHours?: number;
}

export const DEFAULT_AUTO_VERSION_GAP_HOURS = 3;

export const DEFAULT_GIT_VERSIONING_OPTIONS: IGitVersioningOptions = {
  repoMode: 'private',
  author: { name: 'Falang Desktop', email: 'falang@localhost' },
  autoVersionGapHours: DEFAULT_AUTO_VERSION_GAP_HOURS,
};
