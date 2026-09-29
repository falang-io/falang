// Moved to `@falang/desktop-arduino-dto` (see ADR 0029 (private), phase E)
// so `@falang/desktop-mcp`'s stdio server can register the Arduino document stack without pulling in
// Electron/React. Re-exported here so nothing importing this path needs to change.
//
// Deliberately not the package's main barrel — see `driver-config.ts`'s copy of this comment for why
// (it re-exports `driver-registry.ts`'s `node:fs`/`node:path` usage into the renderer).
export {
  PIN_WRITE_DIGITAL,
  PIN_WRITE_ANALOG,
  PIN_READ_DIGITAL,
  PIN_READ_ANALOG,
  PIN_NODE_NAMES,
} from '@falang/desktop-arduino-dto/src/pin-nodes.js';
export type {
  IPinWriteDigitalData,
  IPinWriteAnalogData,
  IPinReadData,
} from '@falang/desktop-arduino-dto/src/pin-nodes.js';
