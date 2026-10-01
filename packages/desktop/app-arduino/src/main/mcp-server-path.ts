import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { electronNodeCommand, stageCopy } from '@falang/desktop-worker-process';

export interface IMcpServerCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
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
/** Packaged builds: the bundled drivers as real files, relative to `process.resourcesPath` (`electron-builder.yml`'s `asarUnpack: resources/**` puts them under `app.asar.unpacked`) — a plain-Node copy/read never has to go through asar. */
const PACKAGED_BUNDLED_DRIVERS_DIR = path.join('app.asar.unpacked', 'resources', 'drivers');
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
 *  - **packaged build**: `<resourcesPath>/mcp-server/index.js . --drivers-dir …` run by this app's
 *    own binary in Node mode (`electronNodeCommand` with `persistent: true` — see `app-sketch`'s
 *    matching comment; never a `node` from `PATH`, ADR 0050 (private), "B1"). Inside an AppImage
 *    both the server bundle and the bundled drivers are staged into `userData` first
 *    (`stablePackagedPath`), since any path under the image's temporary mount dangles once the app
 *    quits. electron-builder's `extraResources` copies a bundled `@falang/desktop-mcp` build into
 *    `resources/mcp-server/index.js`.
 *  - **dev**: `npx tsx <repoRoot>/packages/desktop/mcp/src/main.ts . --drivers-dir …` against the
 *    in-repo source, no build step — matches every other `packages/desktop/*` library's dev posture
 *    (see ADR 0002 (private)'s `runner` note on `tsx` vs plain `node`).
 *
 * `import.meta.dirname` for this file is always `<app>/out/main` in both dev and packaged builds
 * (electron-vite compiles `main` the same way for either — this app's own `main/index.ts` already
 * relies on that fact for its bundled-drivers path), so the repo-root walk-up below is 5 levels:
 * `out/main` → `out` → `arduino` → `desktop` → `packages` → repo root.
 */
/**
 * Packaged builds only: where `.mcp.json` should point for `source` (a path under
 * `process.resourcesPath`). Inside a Linux AppImage everything under `resourcesPath` lives in the
 * image's temporary mount, gone once the app quits, so the file/tree is staged into `userData`
 * first (`stageCopy`, redone only when the app build changes); everywhere else `resourcesPath` is a
 * real installed path and is used as-is (ADR 0050 (private), "B1").
 */
const stablePackagedPath = async (source: string, stagedName: string): Promise<string> => {
  if (!process.env.APPIMAGE) return source;
  const { mtimeMs } = await fs.stat(source);
  return stageCopy({
    source,
    destDir: path.join(app.getPath('userData'), 'staged', stagedName),
    stamp: `${app.getVersion()}:${mtimeMs}`,
  });
};

export const resolveMcpServerCommand = async (): Promise<IMcpServerCommand> => {
  if (app.isPackaged) {
    const serverDir = await stablePackagedPath(path.join(process.resourcesPath, 'mcp-server'), 'mcp-server');
    const driversDir = await stablePackagedPath(
      path.join(process.resourcesPath, PACKAGED_BUNDLED_DRIVERS_DIR),
      'drivers',
    );
    const { command, args, env } = electronNodeCommand(
      path.join(serverDir, 'index.js'),
      ['.', '--drivers-dir', driversDir, '--drivers-dir', userDriversDir()],
      { persistent: true },
    );
    return { command, args: [...args], env: { ...env } };
  }
  const driverArgs = ['--drivers-dir', bundledDriversDir(), '--drivers-dir', userDriversDir()];
  const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
  return {
    args: ['tsx', path.join(repoRoot, 'packages/desktop/mcp/src/main.ts'), '.', ...driverArgs],
    command: 'npx',
  };
};
