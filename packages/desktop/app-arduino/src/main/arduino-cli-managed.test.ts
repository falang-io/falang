/* oxlint-disable no-undefined, require-await, init-declarations, no-plusplus, no-await-expression-member, unicorn/no-await-expression-member, no-promise-executor-return, consistent-function-scoping, unicorn/consistent-function-scoping, no-object-as-default-parameter, unicorn/no-object-as-default-parameter, no-useless-undefined, unicorn/no-useless-undefined */
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readArduinoCliSettings, writeArduinoCliSettings } from '@falang/desktop-arduino-cli';
import { deriveManagedStatus, ManagedArduinoCli, mergeArduinoCliSettings } from './arduino-cli-managed.js';
import { ArduinoCliOperations } from './arduino-cli-operations.js';

describe('mergeArduinoCliSettings', () => {
  const current = {
    source: 'managed',
    managed: { version: '1.5.1', path: '/x', installedAt: 't' },
    lastUpdateCheck: { at: 'a', latest: '1.5.1' },
    customPath: '/old',
  } as const;

  it('never drops managed or lastUpdateCheck', () => {
    expect(mergeArduinoCliSettings(current, { source: 'system' })).toEqual({ ...current, source: 'system' });
  });

  it('applies customPath and checkUpdates only when given', () => {
    expect(
      mergeArduinoCliSettings(current, { source: 'custom', customPath: '/new', checkUpdates: false }),
    ).toMatchObject({
      source: 'custom',
      customPath: '/new',
      checkUpdates: false,
    });
    expect(mergeArduinoCliSettings(current, { source: 'custom', customPath: '' }).customPath).toBe('/old');
  });
});

describe('deriveManagedStatus', () => {
  const managed = { version: '1.5.0', path: '/x', installedAt: 't' };
  it('reports an update from the cached check for the managed source only', () => {
    expect(deriveManagedStatus({ source: 'managed', managed, lastUpdateCheck: { at: 'a', latest: '1.5.1' } })).toEqual({
      managedVersion: '1.5.0',
      latestVersion: '1.5.1',
      updateAvailable: true,
    });
    expect(deriveManagedStatus({ source: 'system', managed, lastUpdateCheck: { at: 'a', latest: '1.5.1' } })).toEqual({
      managedVersion: '1.5.0',
    });
    expect(deriveManagedStatus({ source: 'system' })).toEqual({});
  });
});

describe('ManagedArduinoCli', () => {
  let dir: string;
  let settingsFile: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-managed-ipc-'));
    settingsFile = path.join(dir, 'arduino-cli.json');
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const make = (
    fetch: (url: string) => Promise<Response>,
    ops = new ArduinoCliOperations(),
    changes = { n: 0 },
  ): ManagedArduinoCli =>
    new ManagedArduinoCli({
      settingsFile,
      rootDir: path.join(dir, 'root'),
      fetch,
      platform: 'linux',
      arch: 'x64',
      underArm64Translation: false,
      runExclusive: (kind, fn) => ops.runExclusive(kind, fn),
      onProgress: () => undefined,
      onChanged: () => {
        changes.n++;
      },
      now: () => new Date('2026-11-04T12:00:00Z'),
    });

  it('returns ok:false (never throws) when the download fails and writes no settings', async () => {
    const result = await make(async () => new Response('x', { status: 500 })).install('1.5.1');
    expect(result.ok).toBe(false);
    expect((await readArduinoCliSettings(settingsFile)).source).toBe('system');
  });

  it('refuses while another exclusive operation runs', async () => {
    const ops = new ArduinoCliOperations();
    let release: () => void = () => undefined;
    const running = ops.runExclusive('build', () => new Promise<void>((resolve) => (release = resolve)));
    const result = await make(async () => new Response('x'), ops).install('1.5.1');
    expect(result).toMatchObject({ ok: false });
    release();
    await running;
  });

  it('persists lastUpdateCheck and broadcasts only when a request went out', async () => {
    await writeArduinoCliSettings(settingsFile, {
      source: 'managed',
      managed: { version: '1.5.0', path: '/x', installedAt: 't' },
    });
    const changes = { n: 0 };
    const cli = make(async () => Response.json({ tag_name: 'v1.5.1' }), new ArduinoCliOperations(), changes);
    expect(await cli.checkUpdates()).toEqual({ checked: true, latest: '1.5.1', updateAvailable: true });
    expect((await readArduinoCliSettings(settingsFile)).lastUpdateCheck?.latest).toBe('1.5.1');
    expect(changes.n).toBe(1);
    expect((await cli.checkUpdates()).checked).toBe(false);
    expect(changes.n).toBe(1);
  });

  it('cancel before anything runs is a no-op', () => {
    expect(() => make(async () => new Response('x')).cancelInstall()).not.toThrow();
  });
});
