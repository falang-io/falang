import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseLogicExportConfiguration, writeLogicExportConfiguration } from '@falang/logic-export';

/** Old app's own location, mirroring `falang/config/logic-export.json`'s new one — see `read-old-tree.ts`'s own `falang/schemas` sibling. */
const OLD_EXPORT_CONFIG_RELATIVE_PATH = path.join('falang', 'config', 'export.json');

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';

/**
 * Converts the old app's own per-project export configuration — `falang/config/export.json` under
 * `backupDir` (moved there by `moveOldProjectIntoBackup`, same `{ exports: [{ language, path }] }`
 * shape `@falang/logic-dto`'s `ILogicExportConfiguration` already uses, the old app having used
 * identical field names) — into the new project's `falang/config/logic-export.json`, via
 * `@falang/logic-export`'s `writeLogicExportConfiguration`.
 *
 * A missing old file is a normal outcome, not a warning: every non-`logic` old project has none, and
 * so does a `logic` project that was never configured for export — nothing is written in that case.
 * An old file that *is* present but doesn't validate (an unknown `language`, or a shape that isn't
 * `{ exports: [{ language, path }] }`) throws a clear, file-naming error via
 * `parseLogicExportConfiguration` (the same validation `@falang/logic-export`'s own reader applies to
 * the *new*-format file) — `convertOldProject`'s try/catch rolls the whole conversion back on that,
 * same as any other conversion failure, rather than silently dropping the user's export configuration.
 *
 * Called unconditionally regardless of old project type — harmless for `text`/`console_*` projects,
 * which never have this file.
 */
const readIfPresent = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
};

export const convertExportConfiguration = async (backupDir: string, projectDir: string): Promise<void> => {
  const oldPath = path.join(backupDir, OLD_EXPORT_CONFIG_RELATIVE_PATH);
  const raw = await readIfPresent(oldPath);
  if (raw === null) return;

  const config = parseLogicExportConfiguration(JSON.parse(raw), oldPath);
  await writeLogicExportConfiguration(projectDir, config);
};
