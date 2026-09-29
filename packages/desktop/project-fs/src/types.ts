import type { IProjectTreeDocument, IProjectTreeFolder } from '@falang/dto';

/**
 * Continues the old (pre-`project-fs`) desktop app's own numbering rather than starting over: that
 * app's on-disk format went through versions 1 and 2 (`project.falangproject.json`, `schemeVersion`
 * on each document — see `old/packages/editor/ide/src/project-converters/`), so this package's own
 * first format (`project.json` + `documents/<id>.json`) was 3, not 1. Version 4 is the current
 * layout: manifest at `falang.json`, documents under `falang/schemes/<id>.json`, and a
 * `falang/config/` dir for domain-specific config files (e.g. `@falang/logic-export`'s
 * `logic-export.json`) — see `paths.ts` and ADR 0005 (private)'s
 * "Implementation notes (on-disk layout v4 …)". `openProject` migrates a v3 project to v4 in place
 * on open (`migrate-v3.ts`); `@falang/desktop-project-converter` migrates a v2 (old app) project
 * straight to v4 (see that ADR's "Implementation notes (old-format project migration)").
 */
export const FORMAT_VERSION = 4;

/**
 * `documents`/`folders` are the lightweight tree index (no `root`/`data` payloads) — mirrors
 * `packages/workflow/backend`'s `IProjectTreeResponse`, which keeps the same split between a
 * cheap structure listing and the full per-document payload file.
 */
export interface IProjectManifest {
  name: string;
  type: string;
  formatVersion: number;
  folders: IProjectTreeFolder[];
  documents: IProjectTreeDocument[];
}

export interface ICreateProjectParams {
  name: string;
  type: string;
}
