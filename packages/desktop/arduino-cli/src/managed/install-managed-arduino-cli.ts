/* oxlint-disable no-undefined, no-negated-condition, no-await-in-loop, no-useless-undefined, unicorn/no-useless-undefined */
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseArduinoCliVersion } from '../check-arduino-cli.js';
import { execFileAsync } from '../exec-file-async.js';
import { managedArchiveName, managedArchiveUrl, managedAssetName, managedChecksumsUrl } from './managed-asset.js';
import { fetchLatestArduinoCliVersion, parseChecksums } from './managed-version.js';
import type { TManagedFetch } from './managed-version.js';
import { extractTarGzEntry } from './extract-tar-gz-entry.js';
import { extractZipEntry } from './extract-zip-entry.js';

export interface IManagedInstallProgress {
  readonly phase: 'download';
  readonly received: number;
  readonly total?: number;
}

export interface IInstallManagedArduinoCliParams {
  /** Omitted = the latest stable release. */
  readonly version?: string;
  /** `<userData>/arduino-cli`; every version gets a directory below it. */
  readonly rootDir: string;
  readonly fetch: TManagedFetch;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly underArm64Translation?: boolean;
  readonly onProgress?: (progress: IManagedInstallProgress) => void;
  readonly signal?: AbortSignal;
  /** Runs the installed binary and returns the version it reports (tests). */
  readonly runVersion?: (binaryPath: string) => Promise<string>;
}

export interface IManagedInstallResult {
  readonly version: string;
  readonly path: string;
}

const defaultRunVersion = async (binaryPath: string): Promise<string> => {
  const outcome = await execFileAsync(binaryPath, ['version', '--json']);
  if (!outcome.ok)
    throw new Error(`The downloaded arduino-cli did not start: ${outcome.errorMessage ?? outcome.stderr}`);
  return parseArduinoCliVersion(outcome.stdout);
};

const downloadBuffer = async (
  fetchFn: TManagedFetch,
  url: string,
  signal: AbortSignal | undefined,
  onProgress: ((progress: IManagedInstallProgress) => void) | undefined,
): Promise<Buffer> => {
  const response = await fetchFn(url, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`Download failed: ${response.status} for ${url}`);
  const totalHeader = Number(response.headers.get('content-length'));
  const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : undefined;
  const chunks: Buffer[] = [];
  let received = 0;
  if (!response.body) {
    const whole = Buffer.from(await response.arrayBuffer());
    onProgress?.({ phase: 'download', received: whole.length, ...(total !== undefined ? { total } : {}) });
    return whole;
  }
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    received += value.length;
    onProgress?.({ phase: 'download', received, ...(total !== undefined ? { total } : {}) });
  }
  return Buffer.concat(chunks);
};

/**
 * ADR 0074 (private) §2: download the official archive, verify its sha256 against Arduino's checksum
 * file, extract only the binary into a temp directory, check it runs and reports the expected version,
 * then move it to `<rootDir>/<version>/`. Any failure removes the temp directory and leaves the rest
 * untouched. Writing the settings is the caller's step.
 */
export const installManagedArduinoCli = async (
  params: IInstallManagedArduinoCliParams,
): Promise<IManagedInstallResult> => {
  const asset = managedAssetName(params.platform, params.arch, params.underArm64Translation ?? false);
  if (!asset) throw new Error(`There is no arduino-cli download for ${params.platform}/${params.arch}.`);
  const version = params.version ?? (await fetchLatestArduinoCliVersion(params.fetch, params.signal));

  const archive = await downloadBuffer(
    params.fetch,
    managedArchiveUrl(version, asset),
    params.signal,
    params.onProgress,
  );
  const checksumsResponse = await params.fetch(
    managedChecksumsUrl(version),
    params.signal ? { signal: params.signal } : undefined,
  );
  if (!checksumsResponse.ok) throw new Error(`Could not download the checksums for arduino-cli ${version}.`);
  const expected = parseChecksums(await checksumsResponse.text()).get(managedArchiveName(version, asset));
  if (!expected) throw new Error(`The checksum list has no entry for ${managedArchiveName(version, asset)}.`);
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== expected) throw new Error('The downloaded arduino-cli archive failed its checksum check.');

  const binary =
    asset.archive === 'zip' ? extractZipEntry(archive, asset.binaryName) : extractTarGzEntry(archive, asset.binaryName);

  const finalDir = path.join(params.rootDir, version);
  const tempDir = `${finalDir}.tmp-${randomBytes(6).toString('hex')}`;
  const oldDir = `${finalDir}.old-${randomBytes(6).toString('hex')}`;
  let movedOld = false;
  try {
    await fs.mkdir(tempDir, { recursive: true });
    const tempBinary = path.join(tempDir, asset.binaryName);
    await fs.writeFile(tempBinary, binary);
    if (params.platform !== 'win32') await fs.chmod(tempBinary, 0o755);
    const reported = await (params.runVersion ?? defaultRunVersion)(tempBinary);
    if (reported !== version)
      throw new Error(`The downloaded arduino-cli reports version "${reported}", expected "${version}".`);

    const exists = await fs.stat(finalDir).then(
      () => true,
      () => false,
    );
    if (exists) {
      await fs.rename(finalDir, oldDir);
      movedOld = true;
    }
    try {
      await fs.rename(tempDir, finalDir);
    } catch (error) {
      if (movedOld) await fs.rename(oldDir, finalDir).catch(() => undefined);
      throw error;
    }
    if (movedOld) await fs.rm(oldDir, { recursive: true, force: true }).catch(() => undefined);
    return { version, path: path.join(finalDir, asset.binaryName) };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
};
