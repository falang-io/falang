// Moved to `@falang/desktop-arduino-dto` (see ADR 0029 (private), phase E)
// so `@falang/desktop-mcp`'s stdio server can register the Arduino document stack without pulling in
// Electron/React. Re-exported here so nothing importing this path needs to change.
//
// Deliberately not the package's main barrel — see `driver-config.ts`'s copy of this comment for why
// (it re-exports `driver-registry.ts`'s `node:fs`/`node:path` usage into the renderer).
export {
  DELAY,
  DELAY_MICROSECONDS,
  MILLIS,
  MICROS,
  RANDOM,
  RANDOM_SEED,
  SERIAL_BEGIN,
  SERIAL_PRINT,
  SERIAL_PRINTLN,
  ARDUINO_FUNCTION_NODE_NAMES,
} from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';
export type {
  ISingleNumberActionData,
  IZeroArgReadData,
  IRandomData,
} from '@falang/desktop-arduino-dto/src/arduino-function-nodes.js';
