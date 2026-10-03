// Moved to `@falang/desktop-arduino-dto` (ADR 0051 (private), phase 0) so the headless compiler/scheme packages share one copy.
// Re-exported here so nothing importing this path needs to change.
//
// Deliberately not the package's main barrel — see `driver-config.ts`'s copy of this comment for why
// (it re-exports `driver-registry.ts`'s `node:fs`/`node:path` usage into the renderer).
export * from '@falang/desktop-arduino-dto/src/arduino-builtins.js';
