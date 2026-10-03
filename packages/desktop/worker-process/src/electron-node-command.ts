import type { IWorkerProcessCommand } from './run-in-worker-process.js';

export interface IElectronNodeCommandOptions {
  /**
   * `true` for a command written somewhere that outlives this process (a project's `.mcp.json`):
   * inside a Linux AppImage, `process.execPath` points into the image's temporary mount
   * (`/tmp/.mount_*`), gone as soon as the app quits, so the AppImage file itself (`$APPIMAGE`) is
   * used instead. Irrelevant elsewhere — `process.execPath` is a real installed path on Windows/macOS
   * and in an unpacked Linux build.
   */
  readonly persistent?: boolean;
  /** Overrides for tests; default to the real `process.execPath`/`process.env`. */
  readonly execPath?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * The command that runs a bundled Node script with a **packaged** Electron app's own binary, in plain
 * Node mode (`ELECTRON_RUN_AS_NODE=1` — Electron skips Chromium and behaves as the Node it embeds).
 * A packaged app must never spawn `node` from `PATH`: a typical Windows/macOS user has no Node
 * installed at all, which silently broke every worker and the MCP server in packaged builds (see
 * ADR 0050 (private), "B1"). The same mechanism VS Code uses for its extension host.
 *
 * `process.execPath` *is* the Electron binary in a packaged app (and in dev, `node_modules/electron`'s),
 * so this only belongs on the packaged branch of a caller's dev/packaged split — dev keeps `tsx`
 * against the TypeScript sources.
 */
export const electronNodeCommand = (
  script: string,
  args: readonly string[] = [],
  options: IElectronNodeCommandOptions = {},
): IWorkerProcessCommand => {
  const env = options.env ?? process.env;
  const appImage = env.APPIMAGE;
  const binary =
    options.persistent === true && typeof appImage === 'string' && appImage !== ''
      ? appImage
      : (options.execPath ?? process.execPath);
  return { command: binary, args: [script, ...args], env: { ELECTRON_RUN_AS_NODE: '1' } };
};
