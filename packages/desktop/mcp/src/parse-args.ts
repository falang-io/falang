import * as path from 'node:path';

export interface IParsedArgs {
  readonly projectDirArg?: string;
  readonly driversDirs: readonly string[];
  /** The user's driver library (`--library-drivers-dir`, ADR 0054 (private)); a later flag replaces an earlier one. */
  readonly libraryDriversDir?: string;
}

/**
 * `argv[0]` (after the script) is the project directory; `--drivers-dir <path>` may repeat any number
 * of times, `--library-drivers-dir <path>` names the user's driver library. See `main.ts` for how each is used.
 */
export const parseArgs = (argv: readonly string[]): IParsedArgs => {
  const driversDirs: string[] = [];
  const positional: string[] = [];
  let libraryDriversDir = '';
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === '--drivers-dir') {
      const value = argv[index + 1];
      if (value) driversDirs.push(value);
      index += 2;
    } else if (arg === '--library-drivers-dir') {
      const value = argv[index + 1];
      if (value) libraryDriversDir = value;
      index += 2;
    } else {
      positional.push(arg);
      index += 1;
    }
  }
  return { driversDirs, projectDirArg: positional[0], ...(libraryDriversDir ? { libraryDriversDir } : {}) };
};

/** `FALANG_ARDUINO_DRIVERS_DIRS` is a `PATH`-style list — `;`-separated on Windows (where `:` is part of a drive letter), `:` elsewhere. */
export const splitEnvDirs = (value: string | undefined, delimiter: string = path.delimiter): readonly string[] =>
  (value ?? '')
    .split(delimiter)
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);

export interface IArduinoDriversDirsParams {
  readonly projectDir: string;
  readonly envDirs: readonly string[];
  readonly driversDirs: readonly string[];
  readonly libraryDriversDir?: string;
}

/**
 * The directory list `registerArduinoProjectType` scans, in precedence order (a later directory wins an
 * `id` collision): `FALANG_ARDUINO_DRIVERS_DIRS`, the `--drivers-dir` flags (bundled), the library, and
 * always last the project's own `falang/drivers/` — project > library > bundled, like the app.
 */
export const buildArduinoDriversDirs = ({
  projectDir,
  envDirs,
  driversDirs,
  libraryDriversDir,
}: IArduinoDriversDirsParams): string[] => [
  ...envDirs,
  ...driversDirs,
  ...(libraryDriversDir ? [libraryDriversDir] : []),
  path.join(projectDir, 'falang', 'drivers'),
];
