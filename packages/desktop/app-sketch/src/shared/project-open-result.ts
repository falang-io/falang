import type { IProjectManifest } from '@falang/desktop-project-fs';

/**
 * `IPC.projectOpen`'s result — `converted` is `true` only when this call actually migrated an
 * old-format (`schemeVersion` 2) project just now (see `@falang/desktop-project-converter` and
 * ADR 0005 (private)'s "Implementation notes (old-format project
 * migration)"), so the renderer can show a one-time "converted to the new format" notice instead of
 * on every subsequent open of an already-current-format project.
 */
export interface IProjectOpenResult {
  readonly manifest: IProjectManifest;
  readonly converted: boolean;
}
