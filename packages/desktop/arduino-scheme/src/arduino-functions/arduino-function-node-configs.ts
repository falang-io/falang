// Moved to `@falang/desktop-arduino-dto` (see ADR 0029 (private), phase E).
// Re-exported here so nothing importing this path needs to change.
//
// Deliberately not the package's main barrel — see `driver-node-configs.ts`'s copy of this comment
// for why (it re-exports `driver-registry.ts`'s `node:fs`/`node:path` usage into the renderer).
export { arduinoFunctionNodeConfigs } from '@falang/desktop-arduino-dto/src/arduino-function-node-configs.js';
