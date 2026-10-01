import { constants, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Bare command name — what `execFile` falls back to (a `PATH` lookup) when no candidate is found. */
export const ARDUINO_CLI_COMMAND = 'arduino-cli';

export interface IArduinoCliLookup {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly homeDir: string;
}

/** Where Arduino IDE 2.x keeps its own arduino-cli, relative to the install dir (Windows/Linux) … */
const ARDUINO_IDE_BACKEND = ['resources', 'app', 'lib', 'backend', 'resources'] as const;
/** … and relative to the `.app` bundle on macOS (`Contents/Resources`, capitalised). */
const ARDUINO_IDE_BACKEND_MAC = ['Contents', 'Resources', 'app', 'lib', 'backend', 'resources'] as const;

const pathEntries = (lookup: IArduinoCliLookup): readonly string[] => {
  // Windows environment variable names are case-insensitive; Node keeps the original spelling (`Path`).
  const raw = lookup.platform === 'win32' ? (lookup.env.PATH ?? lookup.env.Path) : lookup.env.PATH;
  const delimiter = lookup.platform === 'win32' ? ';' : ':';
  return (raw ?? '').split(delimiter).filter((entry) => entry.length > 0);
};

const wellKnownDirs = ({ platform, env, homeDir }: IArduinoCliLookup): readonly string[] => {
  const join = platform === 'win32' ? path.win32.join : path.posix.join;
  if (platform === 'darwin') {
    return [
      // Homebrew (Apple Silicon, then Intel) — not on a Finder-launched app's PATH.
      '/opt/homebrew/bin',
      '/usr/local/bin',
      join(homeDir, '.local', 'bin'),
      join(homeDir, 'bin'),
      // The arduino-cli bundled inside Arduino IDE 2.x.
      join('/Applications', 'Arduino IDE.app', ...ARDUINO_IDE_BACKEND_MAC),
      join(homeDir, 'Applications', 'Arduino IDE.app', ...ARDUINO_IDE_BACKEND_MAC),
    ];
  }
  if (platform === 'win32') {
    const dirs: string[] = [];
    if (env.ProgramFiles) dirs.push(join(env.ProgramFiles, 'Arduino CLI'));
    if (env.LOCALAPPDATA) dirs.push(join(env.LOCALAPPDATA, 'Programs', 'Arduino IDE', ...ARDUINO_IDE_BACKEND));
    if (env.ProgramFiles) dirs.push(join(env.ProgramFiles, 'Arduino IDE', ...ARDUINO_IDE_BACKEND));
    return dirs;
  }
  return [join(homeDir, '.local', 'bin'), join(homeDir, 'bin'), '/usr/local/bin', '/usr/bin', '/snap/bin'];
};

/**
 * Every place `arduino-cli` is looked for, in order: the `PATH` entries first (what a terminal
 * would run), then well-known install locations a GUI app's `PATH` usually lacks — a macOS app
 * started from Finder gets only `/usr/bin:/bin:/usr/sbin:/sbin`, so a Homebrew install is invisible
 * to a plain `execFile('arduino-cli')` (ADR 0050 (private), "B3") — and finally the copy Arduino IDE
 * 2.x ships inside its own install (path taken from the IDE's packaging layout, not verified on every
 * OS).
 */
export const arduinoCliCandidates = (lookup: IArduinoCliLookup): readonly string[] => {
  const exe = lookup.platform === 'win32' ? 'arduino-cli.exe' : ARDUINO_CLI_COMMAND;
  const join = lookup.platform === 'win32' ? path.win32.join : path.posix.join;
  const dirs = [...pathEntries(lookup), ...wellKnownDirs(lookup)];
  return [...new Set(dirs.map((dir) => join(dir, exe)))];
};

const isExecutableFile = async (candidate: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(candidate);
    if (!stat.isFile()) return false;
    await fs.access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * The `arduino-cli` binary to run: `FALANG_ARDUINO_CLI` when set (an explicit override, used as-is),
 * else the first existing candidate from `arduinoCliCandidates`, else the bare command name (so the
 * resulting `ENOENT` reads as "arduino-cli not found"). Resolved on every call, never cached — a
 * user who installs it while the app is open is picked up on the next build.
 */
export const resolveArduinoCli = async (
  lookupOverride?: IArduinoCliLookup,
  isExecutable: (candidate: string) => Promise<boolean> = isExecutableFile,
): Promise<string> => {
  const lookup = lookupOverride ?? { platform: process.platform, env: process.env, homeDir: os.homedir() };
  const override = lookup.env.FALANG_ARDUINO_CLI;
  if (typeof override === 'string' && override !== '') return override;
  for (const candidate of arduinoCliCandidates(lookup)) {
    // oxlint-disable-next-line no-await-in-loop -- first match wins; probing in order is the point.
    if (await isExecutable(candidate)) return candidate;
  }
  return ARDUINO_CLI_COMMAND;
};
