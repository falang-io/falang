import { promises as fs } from 'node:fs';
import { configDir, configFilePath } from '@falang/desktop-project-fs';
import {
  LogicExportLanguages,
  type ILogicExportConfiguration,
  type ILogicExportConfigurationItem,
} from '@falang/logic-dto';

/**
 * Where a project's export configuration lives on disk: `<projectDir>/falang/config/logic-export.json`
 * (`@falang/desktop-project-fs`'s `configFilePath`, the v4 on-disk layout's generic per-domain config
 * dir — see ADR 0005 (private)'s "Implementation notes (on-disk layout v4
 * …)"). Deliberately its own file rather than a field on the manifest — `@falang/desktop-project-fs`
 * stays fully domain-agnostic, and its `parseManifest` rebuilds the manifest from known fields only,
 * so any extra field there would be silently dropped on the next folder/document change. The old app
 * kept this in a separate per-project `export` config file for the same reason. Before this v4 layout
 * existed, this file lived directly at `<projectDir>/logic-export.json` — `readLogicExportConfiguration`
 * migrates a legacy file it finds there into the new location (see below).
 */
export const LOGIC_EXPORT_CONFIG_FILENAME = 'logic-export.json';

/** Legacy (pre-v4) location: directly at the project root, next to the old `project.json` manifest. */
const legacyLogicExportConfigPath = (projectDir: string): string => `${projectDir}/${LOGIC_EXPORT_CONFIG_FILENAME}`;

export const logicExportConfigPath = (projectDir: string): string =>
  configFilePath(projectDir, LOGIC_EXPORT_CONFIG_FILENAME);

const isExportItem = (value: unknown): value is ILogicExportConfigurationItem => {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.language === 'string' &&
    (LogicExportLanguages as readonly string[]).includes(item.language) &&
    typeof item.path === 'string'
  );
};

/**
 * Validates and normalizes a raw parsed JSON value into `ILogicExportConfiguration` — same
 * `{ exports: [{ language, path }] }` shape whether it came from the current
 * `falang/config/logic-export.json` or (via `@falang/desktop-project-converter`) the old app's own
 * `falang/config/export.json`, which used identical field names. Exported so both readers share one
 * validation rule instead of maintaining two copies of the `LogicExportLanguages` check.
 */
export const parseLogicExportConfiguration = (raw: unknown, sourcePath: string): ILogicExportConfiguration => {
  if (typeof raw !== 'object' || raw === null)
    throw new Error(`Invalid logic export configuration at ${sourcePath}: not an object`);
  const config = raw as Record<string, unknown>;
  if (!Array.isArray(config.exports) || !config.exports.every(isExportItem))
    throw new Error(
      `Invalid logic export configuration at ${sourcePath}: "exports" must be an array of { language, path }`,
    );
  return { exports: config.exports.map((item) => ({ language: item.language, path: item.path })) };
};

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';

const readIfPresent = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
};

/**
 * `null` when the project has no configuration file yet (a never-configured project) — a malformed
 * file still throws, same posture as `readManifest`. When the new `falang/config/logic-export.json`
 * path is missing but a legacy root `<projectDir>/logic-export.json` exists (a project not yet
 * touched since the v4 on-disk layout migration), the legacy file is moved to the new location first
 * and then read from there — mirrors `@falang/desktop-project-fs`'s own v3 → v4 manifest/document
 * migration, just for this one domain-specific file `project-fs` doesn't know about.
 */
export const readLogicExportConfiguration = async (projectDir: string): Promise<ILogicExportConfiguration | null> => {
  const filePath = logicExportConfigPath(projectDir);
  let raw = await readIfPresent(filePath);
  if (raw === null) {
    const legacyPath = legacyLogicExportConfigPath(projectDir);
    const legacyRaw = await readIfPresent(legacyPath);
    if (legacyRaw !== null) {
      await fs.mkdir(configDir(projectDir), { recursive: true });
      await fs.writeFile(filePath, legacyRaw);
      await fs.rm(legacyPath, { force: true });
      raw = legacyRaw;
    }
  }
  if (raw === null) return null;
  return parseLogicExportConfiguration(JSON.parse(raw), filePath);
};

export const writeLogicExportConfiguration = async (
  projectDir: string,
  config: ILogicExportConfiguration,
): Promise<void> => {
  const serializable: ILogicExportConfiguration = {
    exports: config.exports.map((item) => ({ language: item.language, path: item.path })),
  };
  await fs.mkdir(configDir(projectDir), { recursive: true });
  await fs.writeFile(logicExportConfigPath(projectDir), JSON.stringify(serializable, null, 2));
};
