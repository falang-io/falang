import * as path from 'node:path';
import { app } from 'electron';

export interface IMcpServerCommand {
  command: string;
  args: string[];
}

/**
 * Same relative computation `main/index.ts` already uses for `loadDriverRegistry` (bundled drivers
 * ship under this app's own `resources/drivers/`, see `electron-builder.yml`'s `files`/`asarUnpack`)
 * — duplicated here rather than imported, since `main/index.ts` doesn't export it and the two call
 * sites' only shared concern is this one path, not worth a new module for. `import.meta.dirname` is
 * always `<app>/out/main` in both dev and packaged builds (electron-vite compiles `main` into one
 * output regardless of which source file the code was written in — see this file's own doc comment
 * below for the same invariant relied on for the repo-root walk-up).
 */
const bundledDriversDir = (): string => path.join(import.meta.dirname, '../../resources/drivers');
/** A user's own custom drivers (ADR 0023 (private)'s Phase C) — installed once per app install, not per project. */
const userDriversDir = (): string => path.join(app.getPath('userData'), 'drivers');

/**
 * Resolves the command an MCP client (Claude Code and friends) should run to start this project's
 * `falang` MCP server, written into `.mcp.json` on project create/open (see
 * `@falang/desktop-project-fs`'s `writeAgentFiles` and ADR 0029 (private)'s
 * "Delivery" section), plus this app's own two `--drivers-dir` flags (bundled, then user overrides —
 * `@falang/desktop-mcp`'s `registerArduinoProjectType` merges them in the order given, a later dir's
 * same-id driver winning, same as `loadDriverRegistry` itself). Only appended here — `packages/
 * desktop/app`'s own `mcp-server-path.ts` has no drivers concept and passes nothing extra, per the
 * ADR's phase E "Packaged-build bundle" section.
 *
 *  - **packaged build**: `node <resourcesPath>/mcp-server/index.js . --drivers-dir …` —
 *    electron-builder's `extraResources` copies a bundled `@falang/desktop-mcp` build into
 *    `resources/mcp-server/index.js`. `process.execPath` is Electron's own binary, not a plain
 *    `node`, so it can't run this itself; a `node` on the user's `PATH` is required (same
 *    assumption `@falang/desktop-arduino-cli` already makes about `arduino-cli` being installed).
 *  - **dev**: `npx tsx <repoRoot>/packages/desktop/mcp/src/main.ts . --drivers-dir …` against the
 *    in-repo source, no build step — matches every other `packages/desktop/*` library's dev posture
 *    (see ADR 0002 (private)'s `runner` note on `tsx` vs plain `node`).
 *
 * `import.meta.dirname` for this file is always `<app>/out/main` in both dev and packaged builds
 * (electron-vite compiles `main` the same way for either — this app's own `main/index.ts` already
 * relies on that fact for its bundled-drivers path), so the repo-root walk-up below is 5 levels:
 * `out/main` → `out` → `arduino` → `desktop` → `packages` → repo root.
 */
export const resolveMcpServerCommand = (): IMcpServerCommand => {
  const driverArgs = ['--drivers-dir', bundledDriversDir(), '--drivers-dir', userDriversDir()];
  if (app.isPackaged) {
    return {
      args: [path.join(process.resourcesPath, 'mcp-server', 'index.js'), '.', ...driverArgs],
      command: 'node',
    };
  }
  const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
  return {
    args: ['tsx', path.join(repoRoot, 'packages/desktop/mcp/src/main.ts'), '.', ...driverArgs],
    command: 'npx',
  };
};
