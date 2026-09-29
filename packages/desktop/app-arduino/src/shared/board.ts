// Moved to `@falang/desktop-arduino-dto` (see ADR 0029 (private), phase E)
// so `@falang/desktop-mcp`'s stdio server can share the same board catalog/config shape. Re-exported
// here so nothing importing this path needs to change.
//
// This file is shared by both `main` (`arduino-project-config.ts`) and the renderer
// (`new-project-dialog-store.ts`/`build-panel-modal.tsx`), so — deliberately not the package's main
// barrel (`@falang/desktop-arduino-dto`), the same reason `pin-nodes.ts`'s copy of this comment gives:
// that barrel also re-exports `driver-registry.ts`, which uses `node:fs`/`node:path` to load driver
// configs from disk (a `main`-process concern), and a renderer-side ESM import executes a module's
// whole dependency graph regardless of which named export is actually used — pulling that in crashes
// the renderer at startup with "Module 'node:fs' has been externalized for browser compatibility".
// `board.js` itself has no Node dependencies, so importing it directly keeps this file out of that
// barrel entirely.
export { ARDUINO_BOARDS, DEFAULT_BOARD_FQBN, boardLabel } from '@falang/desktop-arduino-dto/src/board.js';
export type { IArduinoBoardOption, IArduinoProjectConfig } from '@falang/desktop-arduino-dto/src/board.js';
