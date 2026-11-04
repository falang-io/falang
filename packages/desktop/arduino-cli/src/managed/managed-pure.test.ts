/* oxlint-disable require-await, init-declarations */
import { describe, expect, it } from 'vitest';
import { managedArchiveUrl, managedAssetName, managedChecksumsUrl } from './managed-asset.js';
import {
  compareVersions,
  fetchLatestArduinoCliVersion,
  parseChecksums,
  parseLatestRelease,
} from './managed-version.js';

describe('managedAssetName', () => {
  it.each([
    ['linux', 'x64', false, 'Linux_64bit.tar.gz'],
    ['linux', 'arm64', false, 'Linux_ARM64.tar.gz'],
    ['linux', 'arm', false, 'Linux_ARMv7.tar.gz'],
    ['darwin', 'x64', false, 'macOS_64bit.tar.gz'],
    ['darwin', 'x64', true, 'macOS_ARM64.tar.gz'],
    ['darwin', 'arm64', false, 'macOS_ARM64.tar.gz'],
    ['win32', 'x64', false, 'Windows_64bit.zip'],
    ['win32', 'arm64', false, 'Windows_64bit.zip'],
  ] as const)('%s/%s (translated: %s) -> %s', (platform, arch, translated, expected) => {
    expect(managedAssetName(platform, arch, translated)?.asset).toBe(expected);
  });

  it('knows the archive kind and binary name, and returns null for unsupported machines', () => {
    expect(managedAssetName('win32', 'x64')).toMatchObject({ archive: 'zip', binaryName: 'arduino-cli.exe' });
    expect(managedAssetName('linux', 'x64')).toMatchObject({ archive: 'tar.gz', binaryName: 'arduino-cli' });
    expect(managedAssetName('linux', 'ia32')).toBeNull();
    expect(managedAssetName('freebsd', 'x64')).toBeNull();
  });

  it('builds the CDN urls (checksums have no arduino-cli_ prefix)', () => {
    const asset = managedAssetName('linux', 'x64');
    expect(asset && managedArchiveUrl('1.5.1', asset)).toBe(
      'https://downloads.arduino.cc/arduino-cli/arduino-cli_1.5.1_Linux_64bit.tar.gz',
    );
    expect(managedChecksumsUrl('1.5.1')).toBe('https://downloads.arduino.cc/arduino-cli/1.5.1-checksums.txt');
  });
});

describe('versions', () => {
  it('compares release versions numerically and rejects pre-releases', () => {
    expect(compareVersions('1.5.1', '1.5.1')).toBe(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.35.3', '1.0.0')).toBeLessThan(0);
    expect(() => compareVersions('1.5.2-rc.1', '1.5.1')).toThrow();
  });

  it('parses the latest release and ignores drafts, pre-releases and junk', () => {
    expect(parseLatestRelease({ tag_name: 'v1.5.1' })).toBe('1.5.1');
    expect(parseLatestRelease({ tag_name: '1.5.1' })).toBe('1.5.1');
    expect(parseLatestRelease({ tag_name: 'v1.5.2', prerelease: true })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v1.5.2', draft: true })).toBeNull();
    expect(parseLatestRelease({ tag_name: 'v1.5.2-rc.1' })).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
  });

  it('parses sha256sum lines', () => {
    const hash = 'a'.repeat(64);
    const map = parseChecksums(
      `${hash}  arduino-cli_1.5.1_Linux_64bit.tar.gz\r\nnot a line\n${'B'.repeat(64)} *x.zip\n`,
    );
    expect(map.get('arduino-cli_1.5.1_Linux_64bit.tar.gz')).toBe(hash);
    expect(map.get('x.zip')).toBe('b'.repeat(64));
    expect(map.size).toBe(2);
  });

  it('fetches the latest version with GitHub headers and fails on HTTP errors', async () => {
    let seen: Record<string, string> | undefined;
    const ok = async (_url: string, init?: { headers?: Record<string, string> }): Promise<Response> => {
      seen = init?.headers;
      return Response.json({ tag_name: 'v1.5.1' });
    };
    expect(await fetchLatestArduinoCliVersion(ok)).toBe('1.5.1');
    expect(seen?.['User-Agent']).toBeTruthy();
    expect(seen?.Accept).toBe('application/vnd.github+json');
    await expect(fetchLatestArduinoCliVersion(async () => new Response('x', { status: 403 }))).rejects.toThrow(/403/);
  });
});
