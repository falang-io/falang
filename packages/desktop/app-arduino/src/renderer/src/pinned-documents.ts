// The pinned-document rule (`setup`/`loop`/`Devices` — see
// ADR 0032 (private), "Decision → 2") lives in
// `@falang/desktop-arduino-dto` so `@falang/desktop-mcp`'s handlers can apply the exact same rule.
// Re-exported here for the renderer — deliberately not the package's main barrel, see
// `../../shared/driver-config.ts`'s copy of this comment for why (the barrel re-exports
// `driver-registry.ts`'s `node:fs`/`node:path` usage, which crashes the renderer at startup).
export {
  REQUIRED_ROOT_DOCUMENT_NAMES,
  isArduinoPinnedDocument,
  type IPinnableDocument,
} from '@falang/desktop-arduino-dto/src/pinned-documents.js';
