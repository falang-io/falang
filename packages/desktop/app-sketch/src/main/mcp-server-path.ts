import * as path from 'node:path';
import { app } from 'electron';

export interface IMcpServerCommand {
  command: string;
  args: string[];
}

/**
 * Resolves the command an MCP client (Claude Code and friends) should run to start this project's
 * `falang` MCP server, written into `.mcp.json` on project create/open (see
 * `@falang/desktop-project-fs`'s `writeAgentFiles` and ADR 0029 (private)'s
 * "Delivery" section). `@falang/desktop-mcp` (`packages/desktop/mcp`) is the server this points at;
 * its packaging (`build.esbuild.ts` + `electron-builder.yml`'s `extraResources`) satisfies this contract:
 *
 *  - **packaged build**: `node <resourcesPath>/mcp-server/index.js .` — electron-builder's
 *    `extraResources` is expected to copy a bundled `@falang/desktop-mcp` build into
 *    `resources/mcp-server/index.js`. `process.execPath` is Electron's own binary, not a plain
 *    `node`, so it can't run this itself; a `node` on the user's `PATH` is required (same
 *    assumption `@falang/desktop-arduino-cli` already makes about `arduino-cli` being installed).
 *  - **dev**: `npx tsx <repoRoot>/packages/desktop/mcp/src/main.ts .` against the in-repo source,
 *    no build step — matches every other `packages/desktop/*` library's dev posture (see
 *    ADR 0002 (private)'s `runner` note on `tsx` vs plain `node`).
 *
 * `import.meta.dirname` for this file is always `<app>/out/main` in both dev and packaged builds
 * (electron-vite compiles `main` the same way for either — same fact the Arduino app's own
 * `main/index.ts` already relies on for its bundled-drivers path), so the repo-root walk-up below
 * is 5 levels: `out/main` → `out` → `app` → `desktop` → `packages` → repo root.
 */
export const resolveMcpServerCommand = (): IMcpServerCommand => {
  if (app.isPackaged) {
    return { command: 'node', args: [path.join(process.resourcesPath, 'mcp-server', 'index.js'), '.'] };
  }
  const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
  return { command: 'npx', args: ['tsx', path.join(repoRoot, 'packages/desktop/mcp/src/main.ts'), '.'] };
};
