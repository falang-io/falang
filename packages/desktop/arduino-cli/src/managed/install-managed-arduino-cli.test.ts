/* oxlint-disable no-undefined, require-await, no-await-in-loop, no-await-expression-member, unicorn/no-await-expression-member, init-declarations, no-bitwise, no-plusplus, consistent-function-scoping, unicorn/consistent-function-scoping, no-useless-undefined, unicorn/no-useless-undefined */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTarGz, buildZip } from './archive-fixtures.js';
import { cleanupManagedVersions } from './cleanup-managed-versions.js';
import { checkForArduinoCliUpdate } from './check-for-arduino-cli-update.js';
import { installManagedArduinoCli } from './install-managed-arduino-cli.js';
import type { IInstallManagedArduinoCliParams } from './install-managed-arduino-cli.js';
import type { TManagedFetch } from './managed-version.js';

const binary = Buffer.from('#!/bin/sh\necho fake\n');
let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-managed-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const sha = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

const fakeFetch =
  (files: Record<string, Buffer | string | number>): TManagedFetch =>
  async (url) => {
    const body = files[url];
    if (body === undefined || typeof body === 'number')
      return new Response('missing', { status: typeof body === 'number' ? body : 404 });
    return new Response(typeof body === 'string' ? body : new Uint8Array(body), {
      headers: { 'content-length': String(Buffer.byteLength(body)) },
    });
  };

const linuxArchive = buildTarGz([
  { name: 'arduino-cli', data: binary },
  { name: 'LICENSE.txt', data: Buffer.from('l') },
]);
const ARCHIVE_URL = 'https://downloads.arduino.cc/arduino-cli/arduino-cli_1.5.1_Linux_64bit.tar.gz';
const SUMS_URL = 'https://downloads.arduino.cc/arduino-cli/1.5.1-checksums.txt';

const params = (
  fetch: TManagedFetch,
  extra: Partial<IInstallManagedArduinoCliParams> = {},
): IInstallManagedArduinoCliParams => ({
  version: '1.5.1',
  rootDir: root,
  fetch,
  platform: 'linux',
  arch: 'x64',
  runVersion: async () => '1.5.1',
  ...extra,
});

const goodFiles = (): Record<string, Buffer | string> => ({
  [ARCHIVE_URL]: linuxArchive,
  [SUMS_URL]: `${sha(linuxArchive)}  arduino-cli_1.5.1_Linux_64bit.tar.gz\n`,
});

describe('installManagedArduinoCli', () => {
  it('installs, makes the binary executable, reports progress and leaves no temp directory', async () => {
    const progress: number[] = [];
    const result = await installManagedArduinoCli(
      params(fakeFetch(goodFiles()), { onProgress: (p) => progress.push(p.received) }),
    );
    expect(result).toEqual({ version: '1.5.1', path: path.join(root, '1.5.1', 'arduino-cli') });
    expect((await fs.readFile(result.path)).equals(binary)).toBe(true);
    expect((await fs.stat(result.path)).mode & 0o111).not.toBe(0);
    expect(await fs.readdir(root)).toEqual(['1.5.1']);
    expect(progress.at(-1)).toBe(linuxArchive.length);
  });

  it('installs from a zip on Windows', async () => {
    const zip = buildZip([{ name: 'arduino-cli.exe', data: binary, deflate: true }]);
    const url = 'https://downloads.arduino.cc/arduino-cli/arduino-cli_1.5.1_Windows_64bit.zip';
    const files = { [url]: zip, [SUMS_URL]: `${sha(zip)}  arduino-cli_1.5.1_Windows_64bit.zip` };
    const result = await installManagedArduinoCli(params(fakeFetch(files), { platform: 'win32' }));
    expect(result.path).toBe(path.join(root, '1.5.1', 'arduino-cli.exe'));
  });

  it('resolves the latest version when none is given', async () => {
    const fetch: TManagedFetch = async (url, init) =>
      url.includes('api.github.com') ? Response.json({ tag_name: 'v1.5.1' }) : fakeFetch(goodFiles())(url, init);
    const { version, ...rest } = params(fetch);
    expect(version).toBe('1.5.1');
    expect((await installManagedArduinoCli(rest)).version).toBe('1.5.1');
  });

  it('refuses a checksum mismatch and a missing checksum line, leaving nothing behind', async () => {
    await expect(
      installManagedArduinoCli(
        params(fakeFetch({ ...goodFiles(), [SUMS_URL]: `${'0'.repeat(64)}  arduino-cli_1.5.1_Linux_64bit.tar.gz` })),
      ),
    ).rejects.toThrow(/checksum/);
    await expect(
      installManagedArduinoCli(params(fakeFetch({ ...goodFiles(), [SUMS_URL]: `${sha(linuxArchive)}  other.tar.gz` }))),
    ).rejects.toThrow(/no entry/);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('fails on HTTP errors and unsupported machines', async () => {
    await expect(installManagedArduinoCli(params(fakeFetch({})))).rejects.toThrow(/Download failed/);
    await expect(installManagedArduinoCli(params(fakeFetch(goodFiles()), { arch: 'ia32' }))).rejects.toThrow(
      /no arduino-cli download/,
    );
  });

  it('rejects a binary that reports another version and removes the temp directory', async () => {
    await expect(
      installManagedArduinoCli(params(fakeFetch(goodFiles()), { runVersion: async () => '1.4.0' })),
    ).rejects.toThrow(/reports version/);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('keeps the previous copy when verification fails and replaces it when it succeeds', async () => {
    await fs.mkdir(path.join(root, '1.5.1'));
    await fs.writeFile(path.join(root, '1.5.1', 'arduino-cli'), 'old');
    await expect(
      installManagedArduinoCli(params(fakeFetch(goodFiles()), { runVersion: async () => '0.0.1' })),
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(root, '1.5.1', 'arduino-cli'), 'utf8')).toBe('old');
    await installManagedArduinoCli(params(fakeFetch(goodFiles())));
    expect((await fs.readFile(path.join(root, '1.5.1', 'arduino-cli'))).equals(binary)).toBe(true);
    expect(await fs.readdir(root)).toEqual(['1.5.1']);
  });

  it('stops when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch: TManagedFetch = async (_url, init) => {
      init?.signal?.throwIfAborted();
      return new Response('x');
    };
    await expect(installManagedArduinoCli(params(fetch, { signal: controller.signal }))).rejects.toThrow();
  });
});

describe('cleanupManagedVersions', () => {
  it('keeps one version and removes the rest including temp leftovers', async () => {
    for (const name of ['1.4.0', '1.5.1', '1.5.1.tmp-abc', '1.5.0.old-x']) await fs.mkdir(path.join(root, name));
    await cleanupManagedVersions(root, '1.5.1');
    expect(await fs.readdir(root)).toEqual(['1.5.1']);
    await expect(cleanupManagedVersions(path.join(root, 'missing'), undefined)).resolves.toBeUndefined();
  });
});

describe('checkForArduinoCliUpdate', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const latestFetch =
    (version: string, calls: { n: number }): TManagedFetch =>
    async () => {
      calls.n++;
      return Response.json({ tag_name: `v${version}` });
    };
  const managed = { version: '1.5.0', path: '/x', installedAt: '2026-01-01T00:00:00Z' };

  it('only checks the managed source', async () => {
    const calls = { n: 0 };
    expect(
      await checkForArduinoCliUpdate({
        settings: { source: 'system' },
        now,
        fetch: latestFetch('1.5.1', calls),
        force: true,
      }),
    ).toEqual({ checked: false });
    expect(calls.n).toBe(0);
  });

  it('reports an available update and the value to persist', async () => {
    const result = await checkForArduinoCliUpdate({
      settings: { source: 'managed', managed },
      now,
      fetch: latestFetch('1.5.1', { n: 0 }),
    });
    expect(result).toEqual({
      checked: true,
      latest: '1.5.1',
      updateAvailable: true,
      lastUpdateCheck: { at: now.toISOString(), latest: '1.5.1' },
    });
  });

  it('is silent when checking is switched off, unless forced', async () => {
    const settings = { source: 'managed', managed, checkUpdates: false } as const;
    const calls = { n: 0 };
    expect((await checkForArduinoCliUpdate({ settings, now, fetch: latestFetch('1.5.1', calls) })).checked).toBe(false);
    expect(
      (await checkForArduinoCliUpdate({ settings, now, fetch: latestFetch('1.5.1', calls), force: true })).checked,
    ).toBe(true);
    expect(calls.n).toBe(1);
  });

  it('throttles to once a day unless forced', async () => {
    const calls = { n: 0 };
    const recent = { at: '2026-11-04T01:00:00Z', latest: '1.5.1' };
    const settings = { source: 'managed', managed, lastUpdateCheck: recent } as const;
    const throttled = await checkForArduinoCliUpdate({ settings, now, fetch: latestFetch('1.6.0', calls) });
    expect(throttled).toEqual({ checked: false, latest: '1.5.1', updateAvailable: true });
    expect(calls.n).toBe(0);
    const old = { ...settings, lastUpdateCheck: { at: '2026-11-03T11:00:00Z', latest: '1.5.1' } };
    expect((await checkForArduinoCliUpdate({ settings: old, now, fetch: latestFetch('1.6.0', calls) })).latest).toBe(
      '1.6.0',
    );
    expect(
      (await checkForArduinoCliUpdate({ settings, now, fetch: latestFetch('1.6.0', calls), force: true })).latest,
    ).toBe('1.6.0');
  });

  it('swallows network and HTTP errors and says no update when versions are equal', async () => {
    const settings = { source: 'managed', managed } as const;
    expect(
      await checkForArduinoCliUpdate({
        settings,
        now,
        fetch: async () => {
          throw new Error('offline');
        },
      }),
    ).toEqual({ checked: false });
    expect(
      await checkForArduinoCliUpdate({ settings, now, fetch: async () => new Response('', { status: 500 }) }),
    ).toEqual({ checked: false });
    const same = await checkForArduinoCliUpdate({ settings, now, fetch: latestFetch('1.5.0', { n: 0 }) });
    expect(same.updateAvailable).toBe(false);
  });
});
