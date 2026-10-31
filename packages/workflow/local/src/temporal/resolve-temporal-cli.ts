import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

export interface IResolveTemporalCliParams {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly dataDir: string;
  readonly platform?: NodeJS.Platform;
  /** Test seam: resolves when the file is executable. */
  readonly isExecutable?: (file: string) => Promise<boolean>;
}

const defaultIsExecutable = async (file: string): Promise<boolean> => {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** Where the downloaded CLI lives: `<dataDir>/bin/temporal[.exe]`. */
export const getManagedTemporalCliPath = (dataDir: string, platform: NodeJS.Platform = process.platform): string =>
  path.join(dataDir, 'bin', platform === 'win32' ? 'temporal.exe' : 'temporal');

/**
 * Finds the `temporal` CLI: `FALANG_TEMPORAL_CLI`, then the first executable on `PATH`, then the copy
 * `downloadTemporalCli` puts in `<dataDir>/bin`. Returns `null` when none is usable.
 */
export const resolveTemporalCli = async (params: IResolveTemporalCliParams): Promise<string | null> => {
  const platform = params.platform ?? process.platform;
  const isExecutable = params.isExecutable ?? defaultIsExecutable;
  const explicit = params.env.FALANG_TEMPORAL_CLI;
  if (explicit && (await isExecutable(explicit))) return explicit;
  const exeName = platform === 'win32' ? 'temporal.exe' : 'temporal';
  const delimiter = platform === 'win32' ? ';' : ':';
  for (const dir of (params.env.PATH ?? params.env.Path ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, exeName);
    // oxlint-disable-next-line no-await-in-loop -- first match wins, PATH order matters
    if (await isExecutable(candidate)) return candidate;
  }
  const managed = getManagedTemporalCliPath(params.dataDir, platform);
  return (await isExecutable(managed)) ? managed : null;
};
