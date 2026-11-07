import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { downloadBinary, getManagedBinaryPath, managedBinDir, resolveBinary, sha256Hex } from './managed-binary.js';

const executables = (files: string[]) => (file: string) => Promise.resolve(files.includes(file));

describe('managedBinDir', () => {
  it('defaults to <dataDir>/bin and honours FALANG_LOCAL_BIN_DIR', () => {
    expect(managedBinDir({}, '/data')).toBe(path.join('/data', 'bin'));
    expect(managedBinDir({ FALANG_LOCAL_BIN_DIR: '/cache/bin' }, '/data')).toBe('/cache/bin');
  });
});

describe('resolveBinary', () => {
  const base = { name: 'mailpit', envVar: 'FALANG_MAILPIT', binDir: '/data/bin', platform: 'linux' as const };

  it('prefers the env variable', async () => {
    const found = await resolveBinary({
      ...base,
      env: { FALANG_MAILPIT: '/opt/mailpit', PATH: '/usr/bin' },
      isExecutable: executables(['/opt/mailpit', '/usr/bin/mailpit']),
    });
    expect(found).toEqual({ file: '/opt/mailpit', source: 'env' });
  });

  it('fails when the env variable names something unusable', async () => {
    await expect(
      resolveBinary({ ...base, env: { FALANG_MAILPIT: '/nope' }, isExecutable: executables([]) }),
    ).rejects.toThrow(/FALANG_MAILPIT=\/nope/);
  });

  it('then searches PATH in order, then the managed copy', async () => {
    const env = { PATH: '/a:/b' };
    expect(
      await resolveBinary({ ...base, env, isExecutable: executables(['/b/mailpit', '/data/bin/mailpit']) }),
    ).toEqual({ file: '/b/mailpit', source: 'path' });
    expect(await resolveBinary({ ...base, env, isExecutable: executables(['/data/bin/mailpit']) })).toEqual({
      file: '/data/bin/mailpit',
      source: 'managed',
    });
    expect(await resolveBinary({ ...base, env, isExecutable: executables([]) })).toBeNull();
  });

  it('uses .exe names and ; on Windows', async () => {
    const found = await resolveBinary({
      ...base,
      platform: 'win32',
      env: { Path: String.raw`C:\bin;C:\tools` },
      isExecutable: executables([path.join(String.raw`C:\tools`, 'mailpit.exe')]),
    });
    expect(found?.file).toBe(path.join(String.raw`C:\tools`, 'mailpit.exe'));
    expect(getManagedBinaryPath('/d', 'mailpit', 'win32')).toBe(path.join('/d', 'mailpit.exe'));
  });
});

describe('downloadBinary', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'managed-binary-test-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const archive = new TextEncoder().encode('fake archive');
  const fakeFetch = (() => Promise.resolve(new Response(archive))) as unknown as typeof fetch;
  // Stands in for `tar -xf <archive> -C <dir>`: writes the binary the archive would contain.
  const fakeTar = async (_command: string, args: string[]): Promise<void> => {
    await writeFile(path.join(args[3], 'tool'), 'binary');
  };

  it('installs the binary when the checksum matches', async () => {
    const target = path.join(dir, 'bin', 'tool');
    const result = await downloadBinary({
      asset: {
        url: 'https://x/tool.tar.gz',
        fileName: 'tool.tar.gz',
        sha256: sha256Hex(archive),
        binaryPathInArchive: 'tool',
      },
      target,
      label: 'tool',
      installHint: 'hint',
      fetch: fakeFetch,
      run: fakeTar,
    });
    expect(result).toBe(target);
    expect(await readFile(target, 'utf8')).toBe('binary');
    if (process.platform !== 'win32') {
      const { mode } = await stat(target);
      // oxlint-disable-next-line no-bitwise -- the execute bits of a file mode
      expect(mode & 0o111).not.toBe(0);
    }
  });

  it('refuses an archive with another checksum and installs nothing', async () => {
    const target = path.join(dir, 'bin', 'tool');
    await expect(
      downloadBinary({
        asset: {
          url: 'https://x/tool.tar.gz',
          fileName: 'tool.tar.gz',
          sha256: '00'.repeat(32),
          binaryPathInArchive: 'tool',
        },
        target,
        label: 'tool',
        installHint: 'Install it yourself.',
        fetch: fakeFetch,
        run: fakeTar,
      }),
    ).rejects.toThrow(/checksum mismatch.*Install it yourself\./);
    await expect(stat(target)).rejects.toThrow();
  });

  it('reports an HTTP error with the install hint', async () => {
    await expect(
      downloadBinary({
        asset: { url: 'https://x/t', fileName: 't', sha256: 'a', binaryPathInArchive: 't' },
        target: path.join(dir, 't'),
        label: 'tool',
        installHint: 'hint',
        fetch: (() => Promise.resolve(new Response('no', { status: 404 }))) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Could not download tool: HTTP 404.*hint/);
  });
});
