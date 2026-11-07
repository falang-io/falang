// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Locating and installing the ActivePieces service (`activepieces/` at the repository root, see `./activepieces.ts`):
 * `npm ci` when `node_modules` is missing or was installed from another lockfile (a stamp file), serialized across
 * processes by a lock file in the OS temp directory.
 */

/** Overrides where the `activepieces/` directory is (default: found by walking up from this package). */
export const ACTIVEPIECES_DIR_ENV = 'FALANG_ACTIVEPIECES_DIR';
export const ACTIVEPIECES_PACKAGE_NAME = 'falang-workflow-activepieces';
/** Written into `node_modules/` after a successful `npm ci`: the lockfile hash it was installed from. */
export const INSTALL_STAMP_FILE = '.falang-install-stamp';

const isActivepiecesDir = async (dir: string): Promise<boolean> => {
  try {
    const manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { name?: unknown };
    return manifest.name === ACTIVEPIECES_PACKAGE_NAME && existsSync(path.join(dir, 'package-lock.json'));
  } catch {
    return false;
  }
};

/**
 * The `activepieces/` directory: `FALANG_ACTIVEPIECES_DIR` if set, else the first `<ancestor>/activepieces` of
 * `from` holding the service's `package.json` and lockfile. Throws a clear error when there is none.
 */
export const findActivepiecesDir = async (
  from: string = __dirname,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> => {
  const override = env[ACTIVEPIECES_DIR_ENV];
  if (override) {
    const dir = path.resolve(override);
    if (await isActivepiecesDir(dir)) return dir;
    throw new Error(`${ACTIVEPIECES_DIR_ENV}=${override} is not the ActivePieces service directory`);
  }
  let current = path.resolve(from);
  for (;;) {
    const candidate = path.join(current, 'activepieces');
    // oxlint-disable-next-line no-await-in-loop -- walking up one directory at a time
    if (await isActivepiecesDir(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    `The ActivePieces service directory (activepieces/ with ${ACTIVEPIECES_PACKAGE_NAME}'s package.json) was not ` +
      `found above ${from}. The "activepieces" local service needs a repository checkout; set ` +
      `${ACTIVEPIECES_DIR_ENV} to point at it.`,
  );
};

/** What `node_modules` must have been installed from: the lockfile's sha256 plus the Node ABI (native addons). */
export const computeInstallStamp = async (dir: string): Promise<string> => {
  const lock = await readFile(path.join(dir, 'package-lock.json'));
  const hash = createHash('sha256').update(lock).digest('hex');
  return `lock-sha256:${hash} node-abi:${process.versions.modules}`;
};

const stampPath = (dir: string): string => path.join(dir, 'node_modules', INSTALL_STAMP_FILE);

export const readInstallStamp = (dir: string): Promise<string | null> =>
  readFile(stampPath(dir), 'utf8').then(
    (text) => text.trim(),
    () => null,
  );

/** Machine-wide lock file for installing one `activepieces/` directory (kept outside it: `npm ci` wipes `node_modules`). */
export const installLockPath = (dir: string): string =>
  path.join(
    os.tmpdir(),
    `falang-activepieces-install-${createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 16)}.lock`,
  );

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** The current lock holder (`at` from the file, else its mtime); `null` when the lock file is gone. */
const readLockHolder = async (lockFile: string): Promise<{ pid: number | null; at: number | null } | null> => {
  const text = await readFile(lockFile, 'utf8').catch(() => null);
  if (text === null) return null;
  let parsed: { pid?: unknown; at?: unknown } = {};
  try {
    parsed = JSON.parse(text) as { pid?: unknown; at?: unknown };
  } catch {
    // A half-written file: judged by its mtime and an unknown pid.
  }
  const pid = typeof parsed.pid === 'number' ? parsed.pid : null;
  if (typeof parsed.at === 'number') return { pid, at: parsed.at };
  const info = await stat(lockFile).catch(() => null);
  return { pid, at: info ? info.mtimeMs : null };
};

export interface IInstallLockOptions {
  /** Give up waiting for another holder after this long. Default 20 minutes (a cold `npm ci` takes minutes). */
  readonly waitTimeoutMs?: number;
  /** A lock older than this is taken over even if its pid looks alive (pid reuse). Default 30 minutes. */
  readonly staleAfterMs?: number;
  readonly pollMs?: number;
  readonly log?: (line: string) => void;
  readonly isAlive?: (pid: number) => boolean;
}

/**
 * Takes a cross-process lock (`open(…, 'wx')` on `lockFile`, holding `{ pid, at }`); waits while another live
 * process holds it, takes over a lock whose holder is gone or that is older than `staleAfterMs`. Resolves to the
 * release function.
 */
export const acquireInstallLock = async (
  lockFile: string,
  options: IInstallLockOptions = {},
): Promise<() => Promise<void>> => {
  const waitTimeoutMs = options.waitTimeoutMs ?? 20 * 60_000;
  const staleAfterMs = options.staleAfterMs ?? 30 * 60_000;
  const pollMs = options.pollMs ?? 500;
  const isAlive = options.isAlive ?? isProcessAlive;
  const deadline = Date.now() + waitTimeoutMs;
  let announced = false;
  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retried until the lock is free
      const handle = await open(lockFile, 'wx');
      // oxlint-disable-next-line no-await-in-loop -- once, after acquiring
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
      // oxlint-disable-next-line no-await-in-loop -- once, after acquiring
      await handle.close();
      return () => rm(lockFile, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    // oxlint-disable-next-line no-await-in-loop -- inspecting the current holder
    const holder = await readLockHolder(lockFile);
    // Released between open() and the read: retry at once.
    if (holder === null) continue;
    const { pid, at } = holder;
    if (pid === null || !isAlive(pid) || (at !== null && Date.now() - at > staleAfterMs)) {
      options.log?.(`[activepieces] removing a stale install lock ${lockFile} (pid ${String(pid)})`);
      // oxlint-disable-next-line no-await-in-loop -- once per stale lock
      await rm(lockFile, { force: true });
      continue;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for another ActivePieces install (pid ${pid}, lock ${lockFile})`);
    }
    if (!announced) {
      options.log?.(`[activepieces] waiting for another process (pid ${pid}) to finish installing dependencies`);
      announced = true;
    }
    // oxlint-disable-next-line no-await-in-loop -- polling
    await sleep(pollMs);
  }
};

/** Runs `npm ci --no-audit --no-fund` in `dir`, streaming its output to `log`; rejects on a non-zero exit. */
export const runNpmCi = (dir: string, log: (line: string) => void, env: NodeJS.ProcessEnv): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('npm', ['ci', '--no-audit', '--no-fund'], {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    const tail: string[] = [];
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk: Buffer | string) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
          if (!line) continue;
          tail.push(line);
          if (tail.length > 30) tail.shift();
          log(`[activepieces] npm ci: ${line}`);
        }
      });
    }
    child.once('error', (error) => reject(new Error(`npm ci could not be started: ${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ci in ${dir} failed (code ${code}, signal ${signal}):\n${tail.join('\n')}`));
    });
  });

export interface IEnsureInstalledParams {
  readonly dir: string;
  readonly log: (line: string) => void;
  /** Default `runNpmCi`. */
  readonly install?: (dir: string, log: (line: string) => void) => Promise<void>;
  readonly lock?: IInstallLockOptions;
  /** Default `installLockPath(dir)`. */
  readonly lockFile?: string;
}

/**
 * Makes sure `<dir>/node_modules` was installed from the current lockfile (stamp match), else runs `npm ci` under a
 * machine-wide lock and writes the stamp. Re-checks the stamp after taking the lock, so concurrent starts install
 * once. Resolves to whether this call installed.
 */
export const ensureActivepiecesInstalled = async (params: IEnsureInstalledParams): Promise<boolean> => {
  const { dir, log } = params;
  const wanted = await computeInstallStamp(dir);
  if ((await readInstallStamp(dir)) === wanted) return false;
  const release = await acquireInstallLock(params.lockFile ?? installLockPath(dir), { log, ...params.lock });
  try {
    if ((await readInstallStamp(dir)) === wanted) {
      log('[activepieces] dependencies were installed by another process');
      return false;
    }
    const reason = existsSync(path.join(dir, 'node_modules')) ? 'out of date' : 'missing';
    log(`[activepieces] dependencies ${reason}: running npm ci in ${dir} (the first install takes a few minutes)`);
    const startedAt = Date.now();
    const install = params.install ?? ((target, sink) => runNpmCi(target, sink, process.env));
    await install(dir, log);
    await mkdir(path.dirname(stampPath(dir)), { recursive: true });
    await writeFile(stampPath(dir), `${wanted}\n`);
    log(`[activepieces] npm ci done in ${Math.round((Date.now() - startedAt) / 1000)} s`);
    return true;
  } finally {
    await release();
  }
};
