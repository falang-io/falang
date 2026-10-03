import type { IProjectTreeDocument, IProjectTreeFolder } from '@falang/dto';

/**
 * Continues the old (pre-`project-fs`) desktop app's own numbering rather than starting over: that
 * app's on-disk format went through versions 1 and 2 (`project.falangproject.json`, `schemeVersion`
 * on each document — see `old/packages/editor/ide/src/project-converters/`), so this package's own
 * first format (`project.json` + `documents/<id>.json`) was 3, not 1.
 *
 * - v4: manifest at `falang.json`, documents flat under `falang/schemes/<id>.json`, a
 *   `falang/config/` dir for domain-specific config files (ADR 0005 (private)).
 * - v5 (current): documents are named after the scheme and the project tree's folders are real
 *   directories — `falang/schemes/<folder path>/<scheme name>.json`. The manifest stays the source of
 *   truth for ids, names and tree structure and stores each entry's on-disk segment
 *   (`fileName`/`dirName`, see `IManifestDocument`/`IManifestFolder`).
 *
 * `openProject` migrates v3 → v4 (`migrate-v3.ts`) and v4 → v5 (`reconcile-layout.ts`, which also
 * self-heals a layout that drifted from the manifest) in place on open;
 * `@falang/desktop-project-converter` migrates a v2 (old app) project straight to v4.
 */
export const FORMAT_VERSION = 5;

/** A document's tree entry as stored in `falang.json`: the shared DTO plus its on-disk file name. */
export interface IManifestDocument extends IProjectTreeDocument {
  /** File name without `.json`, already sanitized and deduplicated among siblings. Absent in v4 manifests (legacy `<id>.json`). */
  fileName?: string;
}

/** A folder's tree entry as stored in `falang.json`: the shared DTO plus its on-disk directory name. */
export interface IManifestFolder extends IProjectTreeFolder {
  /** Directory name, already sanitized and deduplicated among siblings. Absent in v4 manifests. */
  dirName?: string;
}

/**
 * `documents`/`folders` are the lightweight tree index (no `root`/`data` payloads) — mirrors
 * `packages/workflow/backend`'s `IProjectTreeResponse`, which keeps the same split between a
 * cheap structure listing and the full per-document payload file.
 */
export interface IProjectManifest {
  name: string;
  type: string;
  formatVersion: number;
  folders: IManifestFolder[];
  documents: IManifestDocument[];
}

export interface ICreateProjectParams {
  name: string;
  type: string;
}
