/* oxlint-disable no-console -- the dry-run report of a CLI helper. */
/**
 * Shared helpers of `feed.ts` (ADR 0050 (private)): which app is which feed, rsync to the feed host, update-info files.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import yaml from 'js-yaml';

const APP_DIRS: Record<string, string> = {
  sketch: 'packages/desktop/app-sketch',
  duino: 'packages/desktop/app-arduino',
  arduino: 'packages/desktop/app-arduino',
  flow: 'packages/desktop/app-flow',
};

/** electron-builder's update-info file names: one per OS and channel. */
export const UPDATE_INFO_PATTERN = /^(latest|beta|alpha)(-mac|-linux|-linux-arm64)?\.yml$/;

export interface IFeedApp {
  readonly appDir: string;
  /** The directory on the server, the last segment of `publish.url`. */
  readonly feed: string;
  /** The artifact name prefix, `deb.packageName`. */
  readonly prefix: string;
  readonly version: string;
}

export interface IUpdateInfo {
  version?: string;
  files?: { url?: string }[];
  path?: string;
  releaseNotes?: string;
  stagingPercentage?: number;
  [key: string]: unknown;
}

export class FeedError extends Error {}

/** Reads the feed directory and artifact prefix from the app's own `electron-builder.yml`, so build and feed agree. */
export const loadApp = (name: string | null): IFeedApp => {
  const appDir = name ? APP_DIRS[name] : null;
  if (!appDir) throw new FeedError(`unknown app ${JSON.stringify(name)}; expected sketch, duino or flow`);
  const config = yaml.load(readFileSync(path.join(appDir, 'electron-builder.yml'), 'utf8')) as {
    publish?: { provider?: string; url?: string };
    deb?: { packageName?: string };
  };
  const url = config.publish?.provider === 'generic' ? config.publish.url : null;
  const feed = url ? new URL(url).pathname.replaceAll(/^\/+|\/+$/g, '') : '';
  const prefix = config.deb?.packageName ?? '';
  if (!feed || feed.includes('/')) {
    throw new FeedError(`${appDir}/electron-builder.yml has no generic publish.url with one path segment`);
  }
  if (!prefix) throw new FeedError(`${appDir}/electron-builder.yml has no deb.packageName`);
  const version = (JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8')) as { version: string }).version;
  return { appDir, feed, prefix, version };
};

/** The SSH host (an alias from ~/.ssh/config works) and the site root on it; the files there are root's. */
const target = process.env.FALANG_DOWNLOAD_TARGET ?? 'falang-io';
const siteRoot = (process.env.FALANG_DOWNLOAD_ROOT ?? '/projects/download.falang.io').replace(/\/+$/, '');

/** rsync's remote shell: `FALANG_DOWNLOAD_RSH` verbatim, else ssh (with `FALANG_DOWNLOAD_SSH_KEY` when set). */
const sshCommand = (): string => {
  if (process.env.FALANG_DOWNLOAD_RSH) return process.env.FALANG_DOWNLOAD_RSH;
  const key = process.env.FALANG_DOWNLOAD_SSH_KEY;
  return key ? `ssh -i ${key} -o IdentitiesOnly=yes` : 'ssh';
};

/** `host:<site root>/<relative>` on the feed host. */
export const remote = (relative: string): string =>
  `${target}:${relative === '.' ? siteRoot : `${siteRoot}/${relative}`}`;

/** Runs rsync against the feed host and returns its stdout. */
export const rsync = (args: readonly string[], options: { dryRun?: boolean; allowMissing?: boolean } = {}): string => {
  const full = ['-e', sshCommand(), ...(options.dryRun ? ['--dry-run', '--itemize-changes'] : []), ...args];
  const result = spawnSync('rsync', full, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new FeedError(`rsync: ${result.error.message}`);
  // 23 = "some files could not be transferred", what a missing source directory gives.
  if (result.status === 23 && options.allowMissing) return '';
  if (result.status !== 0)
    throw new FeedError(`rsync ${args.join(' ')} exited with ${result.status}\n${result.stderr}`);
  if (options.dryRun && result.stdout.trim()) console.log(result.stdout.trimEnd());
  return result.stdout;
};

/** Entry names directly in a directory on the host; `kind` selects files (incl. symlinks) or directories. */
export const listRemote = (dir: string, kind: 'files' | 'dirs'): string[] => {
  const pattern =
    kind === 'files' ? /^[-l]\S*\s+[\d,]+\s+\S+\s+\S+\s+(.+?)(?: -> .*)?$/ : /^d\S*\s+[\d,]+\s+\S+\s+\S+\s+(.+)$/;
  return rsync(['--list-only', `${remote(dir)}/`], { allowMissing: true })
    .split('\n')
    .map((line) => pattern.exec(line)?.[1])
    .filter((name) => typeof name === 'string' && name !== '.') as string[];
};

export const readUpdateInfo = (file: string): IUpdateInfo =>
  (yaml.load(readFileSync(file, 'utf8')) as IUpdateInfo | null) ?? {};

export const dumpUpdateInfo = (info: IUpdateInfo): string => yaml.dump(info, { lineWidth: -1 });

/** Downloads the update-info files directly in a directory on the host into a local directory. */
export const pullUpdateInfo = (dir: string, into: string): Map<string, IUpdateInfo> => {
  // -r: without it rsync skips the source directory itself and copies nothing; `--exclude=*` keeps it one level deep.
  rsync(['-rt', '--include=*.yml', '--exclude=*', `${remote(dir)}/`, `${into}/`], { allowMissing: true });
  const result = new Map<string, IUpdateInfo>();
  for (const name of existsSync(into) ? readdirSync(into) : []) {
    if (UPDATE_INFO_PATTERN.test(name)) result.set(name, readUpdateInfo(path.join(into, name)));
  }
  return result;
};

export const isPrerelease = (version: string): boolean => version.includes('-');

const splitVersion = (version: string): { core: number[]; pre: string } => {
  const [core, pre = ''] = version.split('-', 2);
  return { core: core.split('.').map(Number), pre };
};

/** Plain semver precedence for `x.y.z[-pre]`, enough to tell a rollback from an upgrade. */
export const compareVersions = (a: string, b: string): number => {
  const left = splitVersion(a);
  const right = splitVersion(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre.localeCompare(right.pre, 'en', { numeric: true });
};

/** The binaries an update-info file points installed apps at. */
export const referencedFiles = (info: IUpdateInfo): string[] =>
  [...(info.files ?? []).map((file) => file.url), info.path].filter(
    (name) => typeof name === 'string' && name !== '',
  ) as string[];

export const withTempDir = async <T>(run: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'falang-feed-'));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
