/* oxlint-disable unicorn/prefer-string-raw */
import { describe, expect, it } from 'vitest';
import { buildTarGz, buildZip, paxRecord } from './archive-fixtures.js';
import { extractTarGzEntry } from './extract-tar-gz-entry.js';
import { extractZipEntry } from './extract-zip-entry.js';

const payload = Buffer.from('binary-content'.repeat(100));

describe('extractTarGzEntry', () => {
  it('finds a root-level entry among others', () => {
    const tar = buildTarGz([
      { name: 'LICENSE.txt', data: Buffer.from('license') },
      { name: 'arduino-cli', data: payload },
    ]);
    expect(extractTarGzEntry(tar, 'arduino-cli').equals(payload)).toBe(true);
  });

  it('accepts a ./ prefix and ignores same-named files in subdirectories', () => {
    const tar = buildTarGz([
      { name: 'sub/arduino-cli', data: Buffer.from('other') },
      { name: './arduino-cli', data: payload },
    ]);
    expect(extractTarGzEntry(tar, 'arduino-cli').equals(payload)).toBe(true);
  });

  it('throws when the entry is missing', () => {
    expect(() =>
      extractTarGzEntry(buildTarGz([{ name: 'LICENSE.txt', data: Buffer.from('x') }]), 'arduino-cli'),
    ).toThrow(/not found/);
  });

  it.each(['../arduino-cli', '/etc/passwd', 'a/../../b'])('rejects the unsafe path %s', (name) => {
    expect(() => extractTarGzEntry(buildTarGz([{ name, data: Buffer.from('x') }]), 'arduino-cli')).toThrow(
      /Unsafe path/,
    );
  });

  it('joins a ustar prefix and skips PAX and GNU long-name records correctly', () => {
    const longName = 'd'.repeat(120);
    const tar = buildTarGz([
      { name: 'pax', data: paxRecord('path', longName), typeFlag: 'x' },
      { name: 'ignored-short', data: Buffer.from('long'), typeFlag: '0' },
      { name: 'global', data: paxRecord('comment', 'hi'), typeFlag: 'g' },
      { name: 'gnu', data: Buffer.from('arduino-cli\0'), typeFlag: 'L' },
      { name: 'ignored-too', data: payload },
      { name: 'cli', data: Buffer.from('prefixed'), prefix: 'bin' },
    ]);
    expect(extractTarGzEntry(tar, 'arduino-cli').equals(payload)).toBe(true);
    expect(extractTarGzEntry(tar, 'bin/cli').toString()).toBe('prefixed');
    expect(extractTarGzEntry(tar, longName).toString()).toBe('long');
  });
});

describe('extractZipEntry', () => {
  it('reads stored and deflated entries', () => {
    const zip = buildZip([
      { name: 'LICENSE.txt', data: Buffer.from('license') },
      { name: 'arduino-cli.exe', data: payload, deflate: true },
    ]);
    expect(extractZipEntry(zip, 'arduino-cli.exe').equals(payload)).toBe(true);
    expect(extractZipEntry(zip, 'LICENSE.txt').toString()).toBe('license');
  });

  it('throws when the entry is missing or the data is not a zip', () => {
    expect(() => extractZipEntry(buildZip([{ name: 'a', data: payload }]), 'b')).toThrow(/not found/);
    expect(() => extractZipEntry(Buffer.from('nope'), 'a')).toThrow();
  });

  it.each(['../evil.exe', '/abs.exe', 'a\\..\\b.exe'])('rejects the unsafe path %s', (name) => {
    expect(() => extractZipEntry(buildZip([{ name, data: payload }]), 'arduino-cli.exe')).toThrow(/Unsafe path/);
  });
});
