// Moved to `@falang/desktop-arduino-dto` (see ADR 0029 (private), phase E).
// Re-exported here so nothing importing this path needs to change.
//
// Deliberately not the package's main barrel (`@falang/desktop-arduino-dto`): that barrel also
// re-exports `driver-registry.ts`, which uses `node:fs`/`node:path` to load driver configs from
// disk (a `main`-process concern), and a renderer-side ESM import executes a module's whole
// dependency graph regardless of which named export is actually used — pulling that in crashes the
// renderer at startup with "Module 'node:fs' has been externalized for browser compatibility"
// (same fix as `versioning-settings-modal.tsx`'s `@falang/desktop-project-fs` import, see
// ADR 0025 (private)). `driver-node-configs.js` itself has no Node
// dependencies, so importing it directly keeps this file out of that barrel entirely.
export { buildDriverNodeConfigs } from '@falang/desktop-arduino-dto/src/driver-node-configs.js';
