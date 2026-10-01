import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { INode, IProjectDocument } from '@falang/dto';
import { parseDriverBundle, driverConfigFileNames, type IDriverBundle } from './driver-bundle.js';
import { parseDriverConfig, type IDriverConfig } from './driver-config.js';
import { parseDriverActionNodeName } from './driver-node-name.js';
import type { IDevicesDocumentData } from './devices-document.js';
import { scanDriversDir, type IDriverLoadError } from './driver-registry.js';

/**
 * Project-scope custom drivers (ADR 0054 (private)): read/write/delete one driver folder, resolve the
 * bundled ∪ library ∪ project set with precedence, and "adopt" library drivers a project references into
 * `<projectDir>/falang/drivers/` so the project is self-contained. Plain Node.
 */
export const PROJECT_DRIVERS_DIRNAME = 'drivers';
const CONFIG_FILE_NAME = 'driver.config.json';

export const projectDriversDir = (projectDir: string): string =>
  path.join(projectDir, 'falang', PROJECT_DRIVERS_DIRNAME);

export type TDriverScope = 'bundled' | 'library' | 'project';

/** Reads a driver folder (`driver.config.json` + every file it lists) into a validated bundle. */
export const readDriverBundle = async (dir: string): Promise<IDriverBundle> => {
  const config = parseDriverConfig(JSON.parse(await fs.readFile(path.join(dir, CONFIG_FILE_NAME), 'utf8')) as unknown);
  const files: Record<string, string> = {};
  for (const name of driverConfigFileNames(config)) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of small files, sequential keeps errors attributable
    files[name] = await fs.readFile(path.join(dir, name), 'utf8');
  }
  return parseDriverBundle({ formatVersion: 1, config, files });
};

const randomSuffix = (): string => randomBytes(6).toString('hex');

/**
 * Writes `bundle` as `<parentDir>/<id>/` — staged into `<id>.tmp-<random>` first, then swapped in by
 * rename, so a scan never sees a half-written driver (scans skip `.tmp-`/`.old-` names). The bundle is
 * validated first. Returns the driver's final directory.
 */
export const writeDriverBundle = async (parentDir: string, bundle: IDriverBundle): Promise<string> => {
  const valid = parseDriverBundle(bundle);
  const target = path.join(parentDir, valid.config.id);
  const staging = `${target}.tmp-${randomSuffix()}`;
  await fs.mkdir(staging, { recursive: true });
  try {
    await fs.writeFile(path.join(staging, CONFIG_FILE_NAME), `${JSON.stringify(valid.config, null, 2)}\n`);
    await Promise.all(Object.entries(valid.files).map(([name, text]) => fs.writeFile(path.join(staging, name), text)));
    const previous = `${target}.old-${randomSuffix()}`;
    const hadPrevious = await fs.rename(target, previous).then(
      () => true,
      () => false,
    );
    try {
      await fs.rename(staging, target);
    } catch (error) {
      if (hadPrevious) await fs.rename(previous, target).catch(() => null);
      throw error;
    }
    if (hadPrevious) await fs.rm(previous, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
  return target;
};

export const deleteDriverDir = async (parentDir: string, id: string): Promise<void> => {
  await fs.rm(path.join(parentDir, id), { recursive: true, force: true });
};

export interface IResolvedDriver {
  readonly config: IDriverConfig;
  readonly dir: string;
  readonly scope: TDriverScope;
  /** The lower-precedence scope this driver shadows, if any (project > library > bundled). */
  readonly overrides?: 'bundled' | 'library';
}

export interface IResolvedProjectDrivers {
  readonly drivers: readonly IResolvedDriver[];
  readonly errors: readonly (IDriverLoadError & { readonly scope: TDriverScope })[];
}

export interface IResolveProjectDriversParams {
  readonly bundledDir: string;
  readonly libraryDir: string;
  readonly projectDir: string;
}

/** Scans the three scopes; same id: project wins over library wins over bundled. */
export const resolveProjectDrivers = async ({
  bundledDir,
  libraryDir,
  projectDir,
}: IResolveProjectDriversParams): Promise<IResolvedProjectDrivers> => {
  const scopes: readonly [TDriverScope, string][] = [
    ['bundled', bundledDir],
    ['library', libraryDir],
    ['project', projectDriversDir(projectDir)],
  ];
  const scans = await Promise.all(scopes.map(([, dir]) => scanDriversDir(dir)));
  const byId = new Map<string, IResolvedDriver>();
  const errors: (IDriverLoadError & { scope: TDriverScope })[] = [];
  scans.forEach((scan, index) => {
    const scope = scopes[index][0];
    for (const driver of scan.drivers) {
      const previous = byId.get(driver.config.id);
      byId.set(driver.config.id, {
        config: driver.config,
        dir: driver.dir,
        scope,
        ...(previous ? { overrides: previous.scope as 'bundled' | 'library' } : {}),
      });
    }
    for (const error of scan.errors) errors.push({ ...error, scope });
  });
  return { drivers: [...byId.values()], errors };
};

const walkNodes = (node: INode, visit: (node: INode) => void): void => {
  visit(node);
  for (const child of node.children ?? []) walkNodes(child, visit);
  for (const mod of node.mods ?? []) walkNodes(mod, visit);
  if (node.out) walkNodes(node.out, visit);
};

/** Driver ids referenced by a `driver-action::<id>::<action>` node in any document or by a `Devices` instance. */
export const collectReferencedDriverIds = (
  documents: readonly Pick<IProjectDocument, 'root'>[],
  devicesData?: IDevicesDocumentData | null,
): Set<string> => {
  const ids = new Set<string>();
  for (const document of documents) {
    if (!document.root) continue;
    walkNodes(document.root, (node) => {
      const parsed = parseDriverActionNodeName(node.name);
      if (parsed) ids.add(parsed.driverId);
    });
  }
  for (const device of devicesData?.devices ?? []) ids.add(device.driverId);
  return ids;
};

export interface IAdoptReferencedDriversParams extends IResolveProjectDriversParams {
  readonly documents: readonly Pick<IProjectDocument, 'root'>[];
  readonly devicesData?: IDevicesDocumentData | null;
}

export interface IAdoptReferencedDriversResult {
  /** Ids copied into the project this call. */
  readonly adopted: string[];
  /** Referenced ids found in no scope at all. */
  readonly missing: string[];
}

/** One in-flight adoption per project dir at a time (same chain pattern as `ensureArduinoProjectDocuments`). */
const adoptionChains = new Map<string, Promise<unknown>>();

const adoptUnserialized = async (params: IAdoptReferencedDriversParams): Promise<IAdoptReferencedDriversResult> => {
  const referenced = collectReferencedDriverIds(params.documents, params.devicesData);
  const { drivers } = await resolveProjectDrivers(params);
  const byId = new Map(drivers.map((driver) => [driver.config.id, driver]));
  const adopted: string[] = [];
  const missing: string[] = [];
  for (const id of [...referenced].toSorted()) {
    const driver = byId.get(id);
    if (!driver) {
      missing.push(id);
      continue;
    }
    if (driver.scope !== 'library') continue;
    // oxlint-disable-next-line no-await-in-loop -- few drivers, and each copy is an atomic swap
    await writeDriverBundle(projectDriversDir(params.projectDir), await readDriverBundle(driver.dir));
    adopted.push(id);
  }
  return { adopted, missing };
};

/** Copies every referenced driver that resolves to the library scope into the project. Idempotent, serialized per project dir. */
export const adoptReferencedDrivers = (
  params: IAdoptReferencedDriversParams,
): Promise<IAdoptReferencedDriversResult> => {
  const previous = adoptionChains.get(params.projectDir) ?? Promise.resolve();
  const next = previous.then(
    () => adoptUnserialized(params),
    () => adoptUnserialized(params),
  );
  adoptionChains.set(params.projectDir, next);
  const clear = (): void => {
    if (adoptionChains.get(params.projectDir) === next) adoptionChains.delete(params.projectDir);
  };
  next.then(clear, clear);
  return next;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};

/** sha256 over a canonical (key-sorted) serialization — "does this project copy differ from the library version". */
export const driverContentHash = (bundle: IDriverBundle): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize({ config: bundle.config, files: bundle.files })))
    .digest('hex');
