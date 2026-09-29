// Moved to `@falang/desktop-arduino-dto` (see ADR 0029 (private), phase E)
// so `@falang/desktop-mcp`'s stdio server can load the same driver registry the app does, without
// pulling in Electron. Re-exported here so nothing importing this path needs to change.
export { loadDriverRegistry } from '@falang/desktop-arduino-dto';
export type { ILoadedDriver, IDriverLoadError, IDriverRegistry } from '@falang/desktop-arduino-dto';
