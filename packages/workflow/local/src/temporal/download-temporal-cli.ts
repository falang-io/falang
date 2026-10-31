import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getManagedTemporalCliPath } from './resolve-temporal-cli.js';

/** Version whose release asset names were verified (github.com/temporalio/cli). */
export const DEFAULT_TEMPORAL_CLI_VERSION = '1.7.1';

export interface ITemporalCliAsset {
  readonly url: string;
  readonly fileName: string;
  readonly binaryName: string;
}

export const buildTemporalCliAsset = (version: string, platform: NodeJS.Platform, arch: string): ITemporalCliAsset => {
  const osName = ({ win32: 'windows', darwin: 'darwin', linux: 'linux' } as Record<string, string>)[platform];
  const archName = ({ x64: 'amd64', arm64: 'arm64' } as Record<string, string>)[arch];
  if (!osName || !archName) throw new Error(`No prebuilt Temporal CLI for ${platform}/${arch}`);
  const ext = osName === 'windows' ? 'zip' : 'tar.gz';
  const fileName = `temporal_cli_${version}_${osName}_${archName}.${ext}`;
  return {
    url: `https://github.com/temporalio/cli/releases/download/v${version}/${fileName}`,
    fileName,
    binaryName: osName === 'windows' ? 'temporal.exe' : 'temporal',
  };
};

/** `tar -xf` handles .tar.gz everywhere and .zip on Windows 10+ (bsdtar). */
export const buildExtractCommand = (archive: string, destDir: string): { command: string; args: string[] } => ({
  command: 'tar',
  args: ['-xf', archive, '-C', destDir],
});

export interface IDownloadTemporalCliParams {
  readonly dataDir: string;
  readonly version?: string;
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
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

const INSTALL_HINT =
  'Install the Temporal CLI yourself (https://docs.temporal.io/cli) and make `temporal` available on PATH, or set FALANG_TEMPORAL_CLI.';

/** Best-effort fallback: downloads the Temporal CLI into `<dataDir>/bin` and returns its path. */
export const downloadTemporalCli = async (params: IDownloadTemporalCliParams): Promise<string> => {
  const platform = params.platform ?? process.platform;
  const arch = params.arch ?? process.arch;
  const doFetch = params.fetch ?? fetch;
  const run = params.run ?? defaultRun;
  const asset = buildTemporalCliAsset(params.version ?? DEFAULT_TEMPORAL_CLI_VERSION, platform, arch);
  const target = getManagedTemporalCliPath(params.dataDir, platform);
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'falang-temporal-cli-'));
  try {
    const response = await doFetch(asset.url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${asset.url}`);
    const archive = path.join(tmp, asset.fileName);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
    const extractDir = path.join(tmp, 'out');
    await mkdir(extractDir);
    const { command, args } = buildExtractCommand(archive, extractDir);
    await run(command, args);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(extractDir, asset.binaryName), target);
    await chmod(target, 0o755);
    return target;
  } catch (error) {
    throw new Error(`Could not download the Temporal CLI: ${(error as Error).message}. ${INSTALL_HINT}`, {
      cause: error,
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
};
