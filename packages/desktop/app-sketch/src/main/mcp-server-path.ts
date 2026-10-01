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
 * Resolves the command an MCP client (Claude Code and friends) should run to start this project's
 * `falang` MCP server, written into `.mcp.json` on project create/open (see
 * `@falang/desktop-project-fs`'s `writeAgentFiles` and ADR 0029 (private)'s
 * "Delivery" section). `@falang/desktop-mcp` (`packages/desktop/mcp`) is the server this points at;
 * its packaging (`build.esbuild.ts` + `electron-builder.yml`'s `extraResources`) satisfies this contract:
 *
 *  - **packaged build**: `<resourcesPath>/mcp-server/index.js .` run by this app's own binary in
 *    Node mode (`electronNodeCommand` with `persistent: true` — `ELECTRON_RUN_AS_NODE=1` in the
 *    entry's `env`, and the AppImage file rather than its temporary mount on Linux). Never a `node`
 *    from `PATH`, which a typical Windows/macOS user doesn't have (ADR 0050 (private), "B1").
 *    electron-builder's `extraResources` copies a bundled `@falang/desktop-mcp` build into
 *    `resources/mcp-server/index.js`; inside an AppImage that is first staged into `userData`
 *    (`stablePackagedPath`), and `writeAgentFiles` keeps the entry current on every project open.
 *  - **dev**: `npx tsx <repoRoot>/packages/desktop/mcp/src/main.ts .` against the in-repo source,
 *    no build step — matches every other `packages/desktop/*` library's dev posture (see
 *    ADR 0002 (private)'s `runner` note on `tsx` vs plain `node`).
 *
 * `import.meta.dirname` for this file is always `<app>/out/main` in both dev and packaged builds
 * (electron-vite compiles `main` the same way for either — same fact the Arduino app's own
 * `main/index.ts` already relies on for its bundled-drivers path), so the repo-root walk-up below
 * is 5 levels: `out/main` → `out` → `app` → `desktop` → `packages` → repo root.
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
    const { command, args, env } = electronNodeCommand(path.join(serverDir, 'index.js'), ['.'], { persistent: true });
    return { command, args: [...args], env: { ...env } };
  }
  const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
  return { command: 'npx', args: ['tsx', path.join(repoRoot, 'packages/desktop/mcp/src/main.ts'), '.'] };
};
