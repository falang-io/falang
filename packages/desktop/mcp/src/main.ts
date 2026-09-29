import { resolveProjectDir } from './resolve-project-dir.js';
import { startStdioServer } from './stdio.js';

interface IParsedArgs {
  readonly projectDirArg?: string;
  readonly driversDirs: readonly string[];
}

/**
 * `argv[2]` is the project directory (default: cwd, then walked up to the nearest `falang.json` —
 * see `resolveProjectDir`); `--drivers-dir <path>` may repeat any number of times, appended to
 * `FALANG_ARDUINO_DRIVERS_DIRS` (colon-separated) entries — both only matter for an `'arduino'`
 * project (see `arduino-project-type.ts`), ignored otherwise. See ADR 0029 (private)'s phase E task description and the `README.md` here for the packaged-vs-dev command
 * shape both desktop apps' `mcp-server-path.ts` resolve.
 */
const parseArgs = (argv: readonly string[]): IParsedArgs => {
  const driversDirs: string[] = [];
  const positional: string[] = [];
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === '--drivers-dir') {
      const value = argv[index + 1];
      if (value) driversDirs.push(value);
      index += 2;
    } else {
      positional.push(arg);
      index += 1;
    }
  }
  return { driversDirs, projectDirArg: positional[0] };
};

const splitEnvDirs = (value: string | undefined): readonly string[] =>
  (value ?? '')
    .split(':')
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);

const main = async (): Promise<void> => {
  const { driversDirs, projectDirArg } = parseArgs(process.argv.slice(2));
  const projectDir = await resolveProjectDir(projectDirArg ?? process.cwd());
  const arduinoDriversDirs = [...splitEnvDirs(process.env.FALANG_ARDUINO_DRIVERS_DIRS), ...driversDirs];
  await startStdioServer(projectDir, { arduinoDriversDirs });
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  // oxlint-disable-next-line no-console -- fatal startup failure, stderr only (never stdout, the MCP wire protocol).
  console.error(`@falang/desktop-mcp: fatal error: ${message}`);
  process.exitCode = 1;
});
