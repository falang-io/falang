import * as path from 'node:path';

/**
 * On-disk layout v4 (`FORMAT_VERSION` 4, see `types.ts`): the manifest is `<projectDir>/falang.json`,
 * documents live under `<projectDir>/falang/schemes/<id>.json`, and a domain-specific config file
 * (e.g. `@falang/logic-export`'s `logic-export.json`) lives under `<projectDir>/falang/config/`.
 * `FALANG_DIRNAME`/`SCHEMES_DIRNAME`/`CONFIG_DIRNAME` are exported (rather than only the composed
 * path helpers below) so `migrate-v3.ts` and the git-versioning code can build POSIX-relative paths
 * for git blobs/staging without re-deriving OS-specific `path.join` output.
 */
export const FALANG_DIRNAME = 'falang';
export const SCHEMES_DIRNAME = 'schemes';
export const CONFIG_DIRNAME = 'config';
/** One file per chat session (`agent-sessions/<id>.json`), not a single sidecar blob — mirrors `SCHEMES_DIRNAME`, not `locks.ts`'s `.falang-locks.json`, since sessions (like documents) are numerous and can each grow large. See ADR 0033 (private). */
export const AGENT_SESSIONS_DIRNAME = 'agent-sessions';
export const MANIFEST_FILENAME = 'falang.json';

/** v3's manifest/documents layout (`project.json` + `documents/<id>.json`) — used only by `migrate-v3.ts`'s in-place v3 → v4 migration. */
export const LEGACY_MANIFEST_FILENAME = 'project.json';
export const LEGACY_DOCUMENTS_DIRNAME = 'documents';

export const manifestPath = (projectDir: string): string => path.join(projectDir, MANIFEST_FILENAME);

export const falangDir = (projectDir: string): string => path.join(projectDir, FALANG_DIRNAME);

export const documentsDir = (projectDir: string): string => path.join(falangDir(projectDir), SCHEMES_DIRNAME);

export const documentPath = (projectDir: string, documentId: string): string =>
  path.join(documentsDir(projectDir), `${documentId}.json`);

export const configDir = (projectDir: string): string => path.join(falangDir(projectDir), CONFIG_DIRNAME);

export const configFilePath = (projectDir: string, fileName: string): string =>
  path.join(configDir(projectDir), fileName);

export const agentSessionsDir = (projectDir: string): string =>
  path.join(falangDir(projectDir), AGENT_SESSIONS_DIRNAME);

export const agentSessionPath = (projectDir: string, sessionId: string): string =>
  path.join(agentSessionsDir(projectDir), `${sessionId}.json`);

export const legacyManifestPath = (projectDir: string): string => path.join(projectDir, LEGACY_MANIFEST_FILENAME);

export const legacyDocumentsDir = (projectDir: string): string => path.join(projectDir, LEGACY_DOCUMENTS_DIRNAME);
