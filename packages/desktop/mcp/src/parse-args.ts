import * as path from 'node:path';

export interface IParsedArgs {
  readonly projectDirArg?: string;
  readonly driversDirs: readonly string[];
}

/**
 * `argv[0]` (after the script) is the project directory; `--drivers-dir <path>` may repeat any number
 * of times. See `main.ts` for how each is used.
 */
export const parseArgs = (argv: readonly string[]): IParsedArgs => {
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

/** `FALANG_ARDUINO_DRIVERS_DIRS` is a `PATH`-style list — `;`-separated on Windows (where `:` is part of a drive letter), `:` elsewhere. */
export const splitEnvDirs = (value: string | undefined, delimiter: string = path.delimiter): readonly string[] =>
  (value ?? '')
    .split(delimiter)
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);
