import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Finding and downloading a single prebuilt binary an optional local service runs (mailpit today), the same order the
 * Temporal CLI uses: an explicit env variable, then `PATH`, then the copy a download put in the managed bin directory
 * (`managedBinDir`: `<dataDir>/bin`, or `FALANG_LOCAL_BIN_DIR` — `test-e2e:fast` points it at a cache shared by runs).
 */

/** Where downloaded service binaries go: `FALANG_LOCAL_BIN_DIR`, else `<dataDir>/bin`. */
export const managedBinDir = (env: Readonly<Record<string, string | undefined>>, dataDir: string): string =>
  env.FALANG_LOCAL_BIN_DIR || path.join(dataDir, 'bin');

export interface IResolveBinaryParams {
  /** Executable name without extension, e.g. `mailpit`. */
  readonly name: string;
  /** Env variable naming the binary explicitly, e.g. `FALANG_MAILPIT`. */
  readonly envVar: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The managed bin directory (`managedBinDir`). */
  readonly binDir: string;
  readonly platform?: NodeJS.Platform;
  /** Test seam: resolves when the file is executable. */
  readonly isExecutable?: (file: string) => Promise<boolean>;
}

export const isExecutableFile = async (file: string): Promise<boolean> => {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const executableFileName = (name: string, platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? `${name}.exe` : name;

/** Where a downloaded binary lives: `<binDir>/<name>[.exe]`. */
export const getManagedBinaryPath = (
  binDir: string,
  name: string,
  platform: NodeJS.Platform = process.platform,
): string => path.join(binDir, executableFileName(name, platform));

export type TBinarySource = 'env' | 'path' | 'managed';

/**
 * `env[envVar]` (must be executable — a set but unusable value is an error, never silently replaced by another copy),
 * then the first executable on `PATH`, then `binDir`. `null` when none is found.
 */
export const resolveBinary = async (
  params: IResolveBinaryParams,
): Promise<{ readonly file: string; readonly source: TBinarySource } | null> => {
  const platform = params.platform ?? process.platform;
  const isExecutable = params.isExecutable ?? isExecutableFile;
  const explicit = params.env[params.envVar];
  if (explicit) {
    if (await isExecutable(explicit)) return { file: explicit, source: 'env' };
    throw new Error(`${params.envVar}=${explicit} is not an executable file`);
  }
  const exeName = executableFileName(params.name, platform);
  const delimiter = platform === 'win32' ? ';' : ':';
  for (const dir of (params.env.PATH ?? params.env.Path ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, exeName);
    // oxlint-disable-next-line no-await-in-loop -- first match wins, PATH order matters
    if (await isExecutable(candidate)) return { file: candidate, source: 'path' };
  }
  const managed = getManagedBinaryPath(params.binDir, params.name, platform);
  return (await isExecutable(managed)) ? { file: managed, source: 'managed' } : null;
};

export interface IBinaryAsset {
  readonly url: string;
  /** Archive file name (`.tar.gz` or `.zip`). */
  readonly fileName: string;
  /** Lower-case hex SHA-256 of the archive. */
  readonly sha256: string;
  /** Path of the binary inside the extracted archive. */
  readonly binaryPathInArchive: string;
}

export interface IDownloadBinaryParams {
  readonly asset: IBinaryAsset;
  /** Where the binary ends up (`getManagedBinaryPath`). */
  readonly target: string;
  /** Used in error messages. */
  readonly label: string;
  /** Appended to a download error: how to install the binary by hand. */
  readonly installHint: string;
  readonly fetch?: typeof fetch;
  /** Test seam for running the extraction command. */
  readonly run?: (command: string, args: string[]) => Promise<void>;
}

const defaultRun = (command: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

export const sha256Hex = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

/**
 * Downloads `asset`, refuses it unless its SHA-256 matches, extracts it with `tar -xf` (handles `.tar.gz` everywhere and
 * `.zip` on Windows 10+) and installs the binary at `target` (atomically: a copy next to it, then a rename).
 */
export const downloadBinary = async (params: IDownloadBinaryParams): Promise<string> => {
  const doFetch = params.fetch ?? fetch;
  const run = params.run ?? defaultRun;
  const { asset, target } = params;
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'falang-binary-'));
  try {
    const response = await doFetch(asset.url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${asset.url}`);
    const data = new Uint8Array(await response.arrayBuffer());
    const actual = sha256Hex(data);
    if (actual !== asset.sha256.toLowerCase()) {
      throw new Error(`checksum mismatch for ${asset.fileName}: expected sha256 ${asset.sha256}, got ${actual}`);
    }
    const archive = path.join(tmp, asset.fileName);
    await writeFile(archive, data);
    const extractDir = path.join(tmp, 'out');
    await mkdir(extractDir);
    await run('tar', ['-xf', archive, '-C', extractDir]);
    await mkdir(path.dirname(target), { recursive: true });
    const partial = `${target}.${process.pid}.partial`;
    await copyFile(path.join(extractDir, asset.binaryPathInArchive), partial);
    await chmod(partial, 0o755);
    await rename(partial, target);
    return target;
  } catch (error) {
    throw new Error(`Could not download ${params.label}: ${(error as Error).message}. ${params.installHint}`, {
      cause: error,
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
};
