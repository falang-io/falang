import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/** Environment variable carrying the settings file path to a process that has no Electron `main` (the MCP server). */
export const ARDUINO_CLI_SETTINGS_ENV = 'FALANG_ARDUINO_CLI_SETTINGS';

export type TArduinoCliSource = 'system' | 'custom' | 'managed';

/** ADR 0074 (private): which `arduino-cli` the app runs — chosen explicitly, never an implicit cascade. */
export interface IArduinoCliSettings {
  readonly source: TArduinoCliSource;
  readonly customPath?: string;
  /** The installed managed copy; absent until the first download. */
  readonly managed?: { readonly version: string; readonly path: string; readonly installedAt: string };
  /** Managed source only; default true. */
  readonly checkUpdates?: boolean;
  /** Cache of the last successful update check. */
  readonly lastUpdateCheck?: { readonly at: string; readonly latest: string };
}

export const DEFAULT_ARDUINO_CLI_SETTINGS: IArduinoCliSettings = { source: 'system' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

/** Hand-validated: anything malformed is dropped field by field, an unusable `source` means the default. */
const parseSettings = (raw: unknown): IArduinoCliSettings => {
  if (!isRecord(raw)) return DEFAULT_ARDUINO_CLI_SETTINGS;
  const { source, customPath, managed, checkUpdates, lastUpdateCheck } = raw;
  if (source !== 'system' && source !== 'custom' && source !== 'managed') return DEFAULT_ARDUINO_CLI_SETTINGS;
  return {
    source,
    ...(isString(customPath) && customPath !== '' ? { customPath } : {}),
    ...(isRecord(managed) && isString(managed.version) && isString(managed.path) && isString(managed.installedAt)
      ? { managed: { version: managed.version, path: managed.path, installedAt: managed.installedAt } }
      : {}),
    ...(typeof checkUpdates === 'boolean' ? { checkUpdates } : {}),
    ...(isRecord(lastUpdateCheck) && isString(lastUpdateCheck.at) && isString(lastUpdateCheck.latest)
      ? { lastUpdateCheck: { at: lastUpdateCheck.at, latest: lastUpdateCheck.latest } }
      : {}),
  };
};

/** A missing, unreadable or invalid file means `{ source: 'system' }` — existing installs behave as before. */
export const readArduinoCliSettings = async (file: string): Promise<IArduinoCliSettings> => {
  try {
    return parseSettings(JSON.parse(await fs.readFile(file, 'utf8')) as unknown);
  } catch {
    return DEFAULT_ARDUINO_CLI_SETTINGS;
  }
};

/** Atomic: a temp file next to the target, then a rename. */
export const writeArduinoCliSettings = async (file: string, settings: IArduinoCliSettings): Promise<void> => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${randomBytes(6).toString('hex')}`;
  try {
    await fs.writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
};

let settingsFile: string | null = null;

/** Called once by Electron `main` at startup; `null` clears it (tests). */
export const setArduinoCliSettingsFile = (file: string | null): void => {
  settingsFile = file;
};

/** The explicitly set file, else `FALANG_ARDUINO_CLI_SETTINGS`, else `null` (= defaults). */
export const getArduinoCliSettingsFile = (env: NodeJS.ProcessEnv = process.env): string | null => {
  if (settingsFile !== null) return settingsFile;
  const fromEnv = env[ARDUINO_CLI_SETTINGS_ENV];
  return typeof fromEnv === 'string' && fromEnv !== '' ? fromEnv : null;
};
