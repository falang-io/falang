// Moved to `@falang/desktop-arduino-dto` (see ADR 0029 (private), phase E)
// so `@falang/desktop-mcp`'s stdio server can validate `driver-action::…` node data without pulling
// in Electron/React. Re-exported here so nothing importing this path needs to change.
//
// This file is shared by both `main` and the renderer (`driver-action-block.config.tsx` imports it),
// so — deliberately not the package's main barrel (`@falang/desktop-arduino-dto`): that barrel also
// re-exports `driver-registry.ts`, which uses `node:fs`/`node:path` to load driver configs from disk
// (a `main`-process concern), and a renderer-side ESM import executes a module's whole dependency
// graph regardless of which named export is actually used — pulling that in crashes the renderer at
// startup with "Module 'node:fs' has been externalized for browser compatibility" (same fix as
// `versioning-settings-modal.tsx`'s `@falang/desktop-project-fs` import, see
// ADR 0025 (private)). `driver-config.js` itself has no Node dependencies, so
// importing it directly keeps this file out of that barrel entirely.
export {
  DRIVER_FIELD_KINDS,
  DRIVER_RESULT_TYPES,
  DriverConfigValidationError,
  parseDriverConfig,
} from '@falang/desktop-arduino-dto/src/driver-config.js';
export type {
  TDriverFieldKind,
  TDriverResultType,
  IDriverFieldDescriptor,
  IDriverActionDescriptor,
  IDriverDeviceDescriptor,
  IDriverConfig,
} from '@falang/desktop-arduino-dto/src/driver-config.js';
