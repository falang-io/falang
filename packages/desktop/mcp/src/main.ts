import { resolveProjectDir } from './resolve-project-dir.js';
import { startStdioServer } from './stdio.js';
import { buildArduinoDriversDirs, parseArgs, splitEnvDirs } from './parse-args.js';

/**
 * `argv[2]` is the project directory (default: cwd, then walked up to the nearest `falang.json` —
 * see `resolveProjectDir`); `--drivers-dir <path>` may repeat any number of times, `--library-drivers-dir <path>` is the user's driver library
 * and the project's own `falang/drivers/` is always appended last (ADR 0054 (private)), all appended to
 * `FALANG_ARDUINO_DRIVERS_DIRS` (a `PATH`-style list) entries — both only matter for an `'arduino'`
 * project (see `arduino-project-type.ts`), ignored otherwise. See ADR 0029 (private)'s phase E
 * task description and the `README.md` here for the packaged-vs-dev command shape both desktop apps'
 * `mcp-server-path.ts` resolve.
 */
const main = async (): Promise<void> => {
  const { driversDirs, libraryDriversDir, projectDirArg } = parseArgs(process.argv.slice(2));
  const projectDir = await resolveProjectDir(projectDirArg ?? process.cwd());
  const arduinoDriversDirs = buildArduinoDriversDirs({
    projectDir,
    envDirs: splitEnvDirs(process.env.FALANG_ARDUINO_DRIVERS_DIRS),
    driversDirs,
    libraryDriversDir,
  });
  await startStdioServer(projectDir, { arduinoDriversDirs, arduinoLibraryDriversDir: libraryDriversDir });
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  // oxlint-disable-next-line no-console -- fatal startup failure, stderr only (never stdout, the MCP wire protocol).
  console.error(`@falang/desktop-mcp: fatal error: ${message}`);
  process.exitCode = 1;
});
