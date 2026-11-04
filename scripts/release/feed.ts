/* oxlint-disable no-console -- a CLI: its console output is the report. */
/**
 * The static update feed on download.falang.io (ADR 0050 (private)): uploads a built desktop app and releases it.
 *
 *   npx tsx scripts/release/feed.ts upload  <sketch|duino|flow> [--dist <dir>] [--dry-run]
 *   npx tsx scripts/release/feed.ts promote <sketch|duino|flow> <version> [--notes <text|@file>] [--staging <1-100>]
 *                                           [--force] [--dry-run]
 *   npx tsx scripts/release/feed.ts status  <sketch|duino|flow>
 *
 * (`arduino` is accepted for `duino`.) Run from the repository root.
 *
 * `upload` takes the app's `dist/` as electron-builder left it — every OS of one version may sit there together (a
 * local Linux build, `build:wine`, `build:mac-remote` all write into it) — and sends the versioned binaries
 * (`.exe`/`.dmg`/`.zip`/`.AppImage`/`.deb`/`.blockmap`) into `<feed>/` and the update-info files (`latest*.yml`,
 * `beta*.yml`, `alpha*.yml` whose `version` is this one) into `<feed>/.staged/<version>/`. Installed apps and the
 * download page see nothing yet; the binaries are reachable by their direct URL for testing. Upload again after a
 * rebuild (the same version is overwritten until it is promoted) or with another OS's build (staged files of the
 * other OSes are kept). A promoted version is immutable: uploading it again is refused.
 *
 * `promote` moves the staged update-info files of a version into `<feed>/` — from then on installed apps see it —
 * optionally with `releaseNotes` and `stagingPercentage` (the share of installs offered the update, see
 * electron-updater). For a stable version it also repoints `<feed>/latest/`: stable-name symlinks the download page
 * links to (`<prefix>-setup.exe`, `<prefix>.dmg`, `<prefix>.AppImage`, `<prefix>_amd64.deb`) plus `version.json`
 * (version, date, those files and the release notes, read by download.falang.io's pages).
 * Promoting a version older than the live one (a rollback) needs `--force`; it only stops the rollout, installs that
 * already updated stay (electron-updater never downgrades a stable channel).
 *
 * The feed directory and the artifact prefix come from the app's `electron-builder.yml` (`publish.url`,
 * `deb.packageName`). Server access is rsync over SSH as the server's root: `FALANG_DOWNLOAD_TARGET` (SSH host,
 * default `falang-io` from ~/.ssh/config), `FALANG_DOWNLOAD_ROOT` (default `/projects/download.falang.io`),
 * `FALANG_DOWNLOAD_SSH_KEY` (optional identity file), `FALANG_DOWNLOAD_RSH` (the whole remote shell command).
 */
import { existsSync, promises as fs, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import {
  compareVersions,
  dumpUpdateInfo,
  FeedError,
  type IFeedApp,
  type IUpdateInfo,
  isPrerelease,
  listRemote,
  loadApp,
  pullUpdateInfo,
  readUpdateInfo,
  referencedFiles,
  remote,
  rsync,
  UPDATE_INFO_PATTERN,
  withTempDir,
} from './feed-lib.js';

const BINARY_EXTENSIONS = ['.exe', '.dmg', '.zip', '.AppImage', '.deb', '.blockmap'];
const BOOLEAN_FLAGS = new Set(['dry-run', 'force']);

type TFlags = Map<string, string | true>;

const parseArgs = (args: readonly string[]): { positional: string[]; flags: TFlags } => {
  const positional: string[] = [];
  const flags: TFlags = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) positional.push(arg);
    else if (BOOLEAN_FLAGS.has(arg.slice(2))) flags.set(arg.slice(2), true);
    else if (i + 1 < args.length) {
      flags.set(arg.slice(2), args[i + 1]);
      i += 1;
    } else throw new FeedError(`${arg} needs a value`);
  }
  return { positional, flags };
};

const stringFlag = (flags: TFlags, name: string): string | null => {
  const value = flags.get(name);
  return typeof value === 'string' ? value : null;
};

/** The binaries of exactly this version in `dist`, by electron-builder's artifact names. */
const findBinaries = (dist: string, { prefix, version }: IFeedApp): string[] => {
  const starts = [
    `${prefix}-${version}-`,
    `${prefix}-${version}.`,
    `${prefix}-setup-${version}.`,
    `${prefix}_${version}_`,
  ];
  return readdirSync(dist).filter(
    (name) =>
      BINARY_EXTENSIONS.some((ext) => name.endsWith(ext)) &&
      starts.some((start) => name.startsWith(start)) &&
      statSync(path.join(dist, name)).isFile(),
  );
};

const findUpdateInfo = (dist: string, version: string): Map<string, IUpdateInfo> => {
  const result = new Map<string, IUpdateInfo>();
  for (const name of readdirSync(dist).filter((entry) => UPDATE_INFO_PATTERN.test(entry))) {
    const info = readUpdateInfo(path.join(dist, name));
    if (info.version === version) result.set(name, info);
    else console.warn(`  skipping ${name}: it is for version ${info.version}, not ${version}`);
  }
  return result;
};

const upload = async (app: IFeedApp, flags: TFlags): Promise<void> => {
  const dist = path.resolve(stringFlag(flags, 'dist') ?? `${app.appDir}/dist`);
  const dryRun = flags.has('dry-run');
  const { version, feed } = app;
  if (!existsSync(dist)) throw new FeedError(`${dist} does not exist`);
  const binaries = findBinaries(dist, app);
  const updateInfo = findUpdateInfo(dist, version);
  if (binaries.length === 0) throw new FeedError(`no ${app.prefix} ${version} binaries in ${dist}`);
  for (const [name, info] of updateInfo) {
    const missing = referencedFiles(info).filter((file) => !binaries.includes(file));
    if (missing.length > 0) throw new FeedError(`${name} references ${missing.join(', ')}, not found in ${dist}`);
  }

  await withTempDir(async (temp) => {
    const live = pullUpdateInfo(feed, path.join(temp, 'live'));
    const released = [...live].filter(([, info]) => info.version === version).map(([name]) => name);
    if (released.length > 0) {
      throw new FeedError(`${feed} ${version} is already released (${released.join(', ')}); bump the app version`);
    }
    // One local tree mirroring the server, binaries as symlinks (`-L` sends their contents), so a single rsync run
    // creates `.staged/<version>/` too (the server's rsync 3.1 has no `--mkpath`).
    const tree = path.join(temp, 'tree');
    const staged = path.join(tree, feed, '.staged', version);
    await fs.mkdir(staged, { recursive: true });
    await Promise.all([
      ...binaries.map((name) => fs.symlink(path.join(dist, name), path.join(tree, feed, name))),
      ...[...updateInfo.keys()].map((name) => fs.copyFile(path.join(dist, name), path.join(staged, name))),
    ]);
    rsync(['-rtL', '--chmod=D755,F644', `${tree}/`, remote('.')], { dryRun });
  });

  console.log(`${dryRun ? '[dry run] would upload' : 'uploaded'} ${feed} ${version}:`);
  for (const name of binaries) console.log(`  https://download.falang.io/${feed}/${name}`);
  console.log(`  staged: ${[...updateInfo.keys()].join(', ') || '(no update-info files)'}`);
  if (!dryRun) console.log(`release it with: npx tsx scripts/release/feed.ts promote ${feed} ${version}`);
};

const readNotes = (flags: TFlags): string | null => {
  const value = stringFlag(flags, 'notes');
  if (value === null) return null;
  return value.startsWith('@') ? readFileSync(value.slice(1), 'utf8').trim() : value;
};

const readStaging = (flags: TFlags): number | null => {
  const value = stringFlag(flags, 'staging');
  if (value === null) return null;
  const staging = Number(value);
  if (!(Number.isInteger(staging) && staging >= 1 && staging <= 100)) {
    throw new FeedError('--staging takes a whole percentage from 1 to 100');
  }
  return staging;
};

/** `<platform>: [versioned file, stable name in latest/]`; only those present on the server get a link. */
const latestLinks = ({ prefix }: IFeedApp, version: string): Record<string, [string, string]> => ({
  windows: [`${prefix}-setup-${version}.exe`, `${prefix}-setup.exe`],
  mac: [`${prefix}-${version}-x64.dmg`, `${prefix}.dmg`],
  appimage: [`${prefix}-${version}-x86_64.AppImage`, `${prefix}.AppImage`],
  deb: [`${prefix}_${version}_amd64.deb`, `${prefix}_amd64.deb`],
});

const writeLatestDir = async (
  app: IFeedApp,
  version: string,
  onServer: Set<string>,
  dir: string,
  releaseNotes: string | null,
): Promise<string[]> => {
  await fs.mkdir(dir);
  const files: Record<string, string> = {};
  const present = Object.entries(latestLinks(app, version)).filter(([, [file]]) => onServer.has(file));
  await Promise.all(present.map(([, [file, stable]]) => fs.symlink(`../${file}`, path.join(dir, stable))));
  for (const [platform, [, stable]] of present) files[platform] = stable;
  const releasedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(dir, 'version.json'),
    `${JSON.stringify({ app: app.feed, version, releasedAt, files, ...(releaseNotes ? { releaseNotes } : {}) }, null, 2)}\n`,
  );
  return Object.values(files);
};

const promote = async (app: IFeedApp, version: string | null, flags: TFlags): Promise<void> => {
  if (!version) throw new FeedError('promote needs a version');
  const dryRun = flags.has('dry-run');
  const notes = readNotes(flags);
  const staging = readStaging(flags);
  const { feed } = app;

  await withTempDir(async (temp) => {
    const staged = pullUpdateInfo(`${feed}/.staged/${version}`, path.join(temp, 'staged'));
    if (staged.size === 0) throw new FeedError(`nothing staged for ${feed} ${version}; run upload first`);
    const live = pullUpdateInfo(feed, path.join(temp, 'live'));
    const onServer = new Set(listRemote(feed, 'files'));
    for (const [name, info] of staged) {
      const missing = referencedFiles(info).filter((file) => !onServer.has(file));
      if (missing.length > 0)
        throw new FeedError(`${name} references ${missing.join(', ')}, not in ${feed}/ on the server`);
      const current = live.get(name)?.version;
      if (current && compareVersions(version, current) < 0 && !flags.has('force')) {
        throw new FeedError(`${name} is live at ${current}, newer than ${version}; pass --force to roll back`);
      }
    }

    const out = path.join(temp, 'promote');
    await fs.mkdir(out);
    await Promise.all(
      [...staged].map(([name, info]) => {
        const next: IUpdateInfo = { ...info };
        if (notes !== null) next.releaseNotes = notes;
        delete next.stagingPercentage;
        if (staging !== null && staging < 100) next.stagingPercentage = staging;
        return fs.writeFile(path.join(out, name), dumpUpdateInfo(next));
      }),
    );
    // rsync writes each file under a temporary name and renames it, so every swap is atomic for a reader.
    const files = [...staged.keys()].map((name) => path.join(out, name));
    rsync(['-t', '--chmod=F644', ...files, `${remote(feed)}/`], { dryRun });

    const prefix = dryRun ? '[dry run] ' : '';
    if (isPrerelease(version)) {
      console.log(`${prefix}promoted ${feed} ${version} (prerelease: ${feed}/latest/ untouched)`);
      return;
    }
    const latest = path.join(temp, 'latest');
    // The download page shows the notes too: the ones given now, else what the staged files already carry.
    const releaseNotes = notes ?? [...staged.values()].find((info) => info.releaseNotes)?.releaseNotes ?? null;
    const links = await writeLatestDir(app, version, onServer, latest, releaseNotes);
    rsync(['-rlt', '--delete', '--chmod=D755,F644', `${latest}/`, `${remote(feed)}/latest/`], { dryRun });
    console.log(`${prefix}promoted ${feed} ${version}; latest/: ${links.join(', ')}`);
  });
};

const status = async (app: IFeedApp): Promise<void> => {
  const live = await withTempDir((temp) => Promise.resolve(pullUpdateInfo(app.feed, path.join(temp, 'live'))));
  console.log(`${app.feed} (local ${app.appDir}/package.json: ${app.version})`);
  if (live.size === 0) console.log('  live: nothing released yet');
  for (const [name, info] of [...live].toSorted(([a], [b]) => a.localeCompare(b))) {
    const rollout = info.stagingPercentage ? `, staged rollout ${info.stagingPercentage}%` : '';
    console.log(`  live ${name}: ${info.version}${rollout}`);
  }
  const stagedVersions = listRemote(`${app.feed}/.staged`, 'dirs').toSorted(compareVersions);
  console.log(`  staged: ${stagedVersions.join(', ') || 'none'}`);
};

const main = async (): Promise<void> => {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const app = loadApp(positional[0] ?? null);
  if (command === 'upload') await upload(app, flags);
  else if (command === 'promote') await promote(app, positional[1] ?? null, flags);
  else if (command === 'status') await status(app);
  else throw new FeedError('usage: feed.ts <upload|promote|status> <sketch|duino|flow> …');
};

main().catch((error: unknown) => {
  console.error(error instanceof FeedError ? `feed: ${error.message}` : error);
  process.exitCode = 1;
});
