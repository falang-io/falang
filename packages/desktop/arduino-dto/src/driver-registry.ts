import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseDriverConfig, type IDriverConfig } from './driver-config.js';

const CONFIG_FILE_NAME = 'driver.config.json';

export interface ILoadedDriver {
  readonly config: IDriverConfig;
  /** Absolute path to the driver's own folder — `sourceFiles`/`includes` are resolved against this. */
  readonly dir: string;
}

export interface IDriverLoadError {
  readonly dir: string;
  readonly message: string;
}

export interface IDriverRegistry {
  readonly drivers: readonly ILoadedDriver[];
  readonly errors: readonly IDriverLoadError[];
}

const loadOneDriver = async (dir: string): Promise<ILoadedDriver> => {
  const raw = await fs.readFile(path.join(dir, CONFIG_FILE_NAME), 'utf8');
  const config = parseDriverConfig(JSON.parse(raw) as unknown);
  for (const fileName of new Set([...config.sourceFiles, ...config.includes])) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of small files per driver, sequential is fine and keeps the error message attributable to one file.
    await fs.access(path.join(dir, fileName));
  }
  return { config, dir };
};

/**
 * Scans a directory of `{driverId}/driver.config.json` folders — used for both the app's bundled
 * `resources/drivers/` and a user's own `userData/drivers/` (Phase C custom drivers), merged into one
 * registry by `loadDriverRegistry`. A folder with no `driver.config.json`, or one that fails to
 * validate, is skipped (recorded in `errors`) rather than crashing the app — see the ADR's Phase C
 * "bad config = skipped, not fatal" decision.
 */
const scanDriversDir = async (driversDir: string): Promise<IDriverRegistry> => {
  let entries: string[] = [];
  try {
    const dirents = await fs.readdir(driversDir, { withFileTypes: true });
    entries = dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return { drivers: [], errors: [] };
  }

  const drivers: ILoadedDriver[] = [];
  const errors: IDriverLoadError[] = [];
  for (const entryName of entries) {
    const dir = path.join(driversDir, entryName);
    try {
      // oxlint-disable-next-line no-await-in-loop -- app-startup, one-time scan of a handful of driver folders; sequential keeps errors attributable to one folder at a time.
      drivers.push(await loadOneDriver(dir));
    } catch (error) {
      errors.push({ dir, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { drivers, errors };
};

/**
 * Generalization of `loadDriverRegistry` to any number of directories, scanned and merged in order —
 * a later directory's driver wins over an earlier one with the same `id`. Added for
 * `@falang/desktop-mcp` (ADR phase E), whose `--drivers-dir` CLI flag can be repeated any number of
 * times (bundled + user, or several `--drivers-dir` overrides for a dev/test setup), unlike the app's
 * own fixed bundled/user pair.
 */
export const loadDriverRegistryFromDirs = async (driversDirs: readonly string[]): Promise<IDriverRegistry> => {
  const scans = await Promise.all(driversDirs.map((dir) => scanDriversDir(dir)));
  const byId = new Map<string, ILoadedDriver>();
  const errors: IDriverLoadError[] = [];
  for (const scan of scans) {
    for (const driver of scan.drivers) byId.set(driver.config.id, driver);
    errors.push(...scan.errors);
  }
  return { drivers: [...byId.values()], errors };
};

/** Bundled drivers (shipped with the app) first, then user-added ones (Phase C) — a user driver with the same `id` as a bundled one wins, letting a user override a stock driver by dropping a same-named folder into their own `drivers/`. */
export const loadDriverRegistry = (bundledDriversDir: string, userDriversDir: string): Promise<IDriverRegistry> =>
  loadDriverRegistryFromDirs([bundledDriversDir, userDriversDir]);
