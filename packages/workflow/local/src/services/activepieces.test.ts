// oxlint-disable init-declarations, no-undefined -- test code
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVEPIECES_DIR_ENV,
  ACTIVEPIECES_PACKAGE_NAME,
  INSTALL_STAMP_FILE,
  acquireInstallLock,
  buildActivepiecesProcessEnv,
  computeInstallStamp,
  createActivepiecesService,
  ensureActivepiecesInstalled,
  findActivepiecesDir,
  readInstallStamp,
} from './activepieces.js';
import type { IStartSupervisedProcessParams, ISupervisedProcess } from './supervisor.js';
import type { ILocalServiceContext } from './types.js';

let root: string;
let serviceDir: string;
let lockFile: string;

const writeServiceDir = async (dir: string, lock = '{"lockfileVersion":3}'): Promise<void> => {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: ACTIVEPIECES_PACKAGE_NAME }));
  await writeFile(path.join(dir, 'package-lock.json'), lock);
};

/** A fake `npm ci`: creates `node_modules/` (wiping the old one's stamp like the real thing). */
const fakeInstall = vi.fn(async (dir: string) => {
  await mkdir(path.join(dir, 'node_modules'), { recursive: true });
  await writeFile(path.join(dir, 'node_modules', INSTALL_STAMP_FILE), 'wiped');
});

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'falang-ap-test-'));
  serviceDir = path.join(root, 'activepieces');
  lockFile = path.join(root, 'install.lock');
  await writeServiceDir(serviceDir);
  fakeInstall.mockClear();
});

describe('findActivepiecesDir', () => {
  it('walks up from a nested directory to <ancestor>/activepieces', async () => {
    const nested = path.join(root, 'packages', 'workflow', 'local', 'src');
    await mkdir(nested, { recursive: true });
    await expect(findActivepiecesDir(nested, {})).resolves.toBe(serviceDir);
  });

  it('ignores an activepieces/ directory of another package', async () => {
    const other = await mkdtemp(path.join(os.tmpdir(), 'falang-ap-other-'));
    await mkdir(path.join(other, 'activepieces'));
    await writeFile(path.join(other, 'activepieces', 'package.json'), JSON.stringify({ name: 'something-else' }));
    await expect(findActivepiecesDir(other, {})).rejects.toThrow(/needs a repository checkout/);
  });

  it('honours the override and rejects a wrong one', async () => {
    await expect(findActivepiecesDir('/', { [ACTIVEPIECES_DIR_ENV]: serviceDir })).resolves.toBe(serviceDir);
    await expect(findActivepiecesDir('/', { [ACTIVEPIECES_DIR_ENV]: root })).rejects.toThrow(
      /is not the ActivePieces service directory/,
    );
  });
});

describe('ensureActivepiecesInstalled', () => {
  const ensure = () =>
    ensureActivepiecesInstalled({
      dir: serviceDir,
      log: () => null,
      install: fakeInstall,
      lockFile,
      lock: { pollMs: 10 },
    });

  it('installs when node_modules is missing, then not again', async () => {
    await expect(ensure()).resolves.toBe(true);
    expect(fakeInstall).toHaveBeenCalledTimes(1);
    expect(await readInstallStamp(serviceDir)).toBe(await computeInstallStamp(serviceDir));
    await expect(ensure()).resolves.toBe(false);
    expect(fakeInstall).toHaveBeenCalledTimes(1);
    expect(existsSync(lockFile)).toBe(false);
  });

  it('reinstalls when the lockfile changes, and when node_modules has no stamp', async () => {
    await ensure();
    await writeFile(path.join(serviceDir, 'package-lock.json'), '{"lockfileVersion":3,"changed":true}');
    await expect(ensure()).resolves.toBe(true);
    await writeFile(path.join(serviceDir, 'node_modules', INSTALL_STAMP_FILE), '');
    await expect(ensure()).resolves.toBe(true);
    expect(fakeInstall).toHaveBeenCalledTimes(3);
  });

  it('installs once for concurrent callers', async () => {
    const results = await Promise.all([ensure(), ensure(), ensure()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(fakeInstall).toHaveBeenCalledTimes(1);
  });

  it('writes no stamp and releases the lock when the install fails', async () => {
    fakeInstall.mockRejectedValueOnce(new Error('npm ci failed'));
    await expect(ensure()).rejects.toThrow('npm ci failed');
    expect(await readInstallStamp(serviceDir)).toBe(null);
    expect(existsSync(lockFile)).toBe(false);
    await expect(ensure()).resolves.toBe(true);
  });
});

describe('acquireInstallLock', () => {
  it('takes over a lock whose holder is gone', async () => {
    await writeFile(lockFile, JSON.stringify({ pid: 999_999, at: Date.now() }));
    const release = await acquireInstallLock(lockFile, { isAlive: () => false, pollMs: 10 });
    expect(JSON.parse(await readFile(lockFile, 'utf8'))).toMatchObject({ pid: process.pid });
    await release();
    expect(existsSync(lockFile)).toBe(false);
  });

  it('takes over a lock older than staleAfterMs even if the pid looks alive', async () => {
    await writeFile(lockFile, JSON.stringify({ pid: 1, at: Date.now() - 60_000 }));
    const release = await acquireInstallLock(lockFile, { isAlive: () => true, staleAfterMs: 1000, pollMs: 10 });
    await release();
  });

  it('waits for a live holder, then times out', async () => {
    await writeFile(lockFile, JSON.stringify({ pid: 1, at: Date.now() }));
    await expect(acquireInstallLock(lockFile, { isAlive: () => true, waitTimeoutMs: 50, pollMs: 10 })).rejects.toThrow(
      /Timed out waiting/,
    );
  });

  it('gets the lock once the holder releases it', async () => {
    const releaseFirst = await acquireInstallLock(lockFile, { pollMs: 10 });
    let acquired = false;
    const second = acquireInstallLock(lockFile, { pollMs: 10 }).then((release) => {
      acquired = true;
      return release;
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(acquired).toBe(false);
    await releaseFirst();
    await (
      await second
    )();
  });
});

describe('buildActivepiecesProcessEnv', () => {
  const base = { PATH: '/bin', NODE_ENV: 'test', MOCK_OAUTH_BASE_URL: 'http://elsewhere' };

  it('turns the mock pieces on in test mode, served by the service itself', () => {
    expect(
      buildActivepiecesProcessEnv({
        baseEnv: base,
        port: 4321,
        internalUrl: 'http://127.0.0.1:9',
        secret: 's',
        testMode: true,
      }),
    ).toMatchObject({
      PATH: '/bin',
      PORT: '4321',
      BACKEND_INTERNAL_URL: 'http://127.0.0.1:9',
      ACTIVEPIECES_SERVICE_SECRET: 's',
      NODE_ENV: 'test',
      MOCK_OAUTH_BASE_URL: 'http://127.0.0.1:4321/mock-oauth2',
    });
  });

  it('never registers mock pieces outside test mode, whatever the inherited env says', () => {
    const env = buildActivepiecesProcessEnv({
      baseEnv: base,
      port: 1,
      internalUrl: 'http://127.0.0.1:9',
      secret: 's',
      testMode: false,
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.MOCK_OAUTH_BASE_URL).toBeUndefined();
  });
});

describe('activepieces service', () => {
  it('installs, starts the service and hands its URL and secret to the right places', async () => {
    const stop = vi.fn(() => Promise.resolve());
    const startProcess = vi.fn(
      (_params: IStartSupervisedProcessParams): Promise<ISupervisedProcess> =>
        Promise.resolve({ pid: 1, exited: Promise.resolve({ code: 0, signal: null }), outputTail: () => [], stop }),
    );
    const ensureInstalled = vi.fn(() => Promise.resolve(false));
    // A real `tsx` must be resolvable from the service directory.
    await mkdir(path.join(serviceDir, 'node_modules', 'tsx'), { recursive: true });
    await writeFile(
      path.join(serviceDir, 'node_modules', 'tsx', 'package.json'),
      JSON.stringify({ name: 'tsx', main: 'loader.cjs' }),
    );
    await writeFile(path.join(serviceDir, 'node_modules', 'tsx', 'loader.cjs'), '');
    const service = createActivepiecesService({
      findDir: () => Promise.resolve(serviceDir),
      ensureInstalled,
      startProcess,
    });
    const ctx: ILocalServiceContext = {
      name: 'activepieces',
      dataDir: root,
      rootDataDir: root,
      log: () => null,
      findFreePort: () => Promise.resolve(5555),
      publicUrl: 'http://localhost:4000',
      internalUrl: 'http://127.0.0.1:4001',
      testMode: true,
      childEnv: { PATH: '/bin' },
      getSecret: (key) => Promise.resolve(`secret-of-${key}`),
    };
    const handle = await service.start(ctx);

    expect(ensureInstalled).toHaveBeenCalledWith(expect.objectContaining({ dir: serviceDir }));
    const params = startProcess.mock.calls[0]?.[0];
    expect(params?.command).toBe(process.execPath);
    expect(params?.args?.slice(-1)).toEqual(['src/main.ts']);
    expect(params?.args?.[1]).toMatch(/^file:.*node_modules\/tsx\/loader\.cjs$/);
    expect(params?.cwd).toBe(serviceDir);
    expect(params?.env).toMatchObject({
      PORT: '5555',
      BACKEND_INTERNAL_URL: 'http://127.0.0.1:4001',
      ACTIVEPIECES_SERVICE_SECRET: 'secret-of-ACTIVEPIECES_SERVICE_SECRET',
      NODE_ENV: 'test',
    });
    expect(params?.ready).toEqual(expect.objectContaining({ url: 'http://127.0.0.1:5555/health' }));

    expect(handle.backendEnv).toEqual({ ACTIVEPIECES_SERVICE_URL: 'http://127.0.0.1:5555' });
    expect(handle.backendSecretEnv).toEqual({ ACTIVEPIECES_SERVICE_SECRET: 'secret-of-ACTIVEPIECES_SERVICE_SECRET' });
    expect(handle.testEnv).toEqual({
      ACTIVEPIECES_URL: 'http://127.0.0.1:5555',
      ACTIVEPIECES_SERVICE_SECRET: 'secret-of-ACTIVEPIECES_SERVICE_SECRET',
    });
    expect(handle.capabilities).toEqual(['activepieces']);
    await handle.stop();
    expect(stop).toHaveBeenCalledTimes(1);

    // An exported secret is what the backend will use (`??=`), so the service takes it too.
    const second = await service.start({ ...ctx, childEnv: { ACTIVEPIECES_SERVICE_SECRET: 'exported' } });
    expect(startProcess.mock.calls[1]?.[0].env?.ACTIVEPIECES_SERVICE_SECRET).toBe('exported');
    expect(second.backendSecretEnv).toEqual({ ACTIVEPIECES_SERVICE_SECRET: 'exported' });
  });
});
