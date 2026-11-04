// oxlint-disable no-console -- this is a CLI: console is its output.
/**
 * Builds the desktop app in the current directory for macOS (x64, unsigned `.dmg` + `.zip`) on a Mac reached over SSH
 * — the `build:mac-remote` script of every `packages/desktop/app-*`. Meant for a Linux development machine with an
 * Intel Mac on the network; the native route (`build:mac` on a Mac, the `mac` job of
 * `.github/workflows/desktop-release.yml`) is unchanged.
 *
 * Steps: sync the working tree (exactly `git ls-files -co --exclude-standard`, uncommitted changes included, nothing
 * pushed; files deleted here are deleted there) → `npm ci` on the Mac when `package-lock.json` changed → `prebuild:mac`
 * + `build` + `electron-builder --mac --x64` → the packaged-app smoke test (`smoke-desktop-app.ts`) → copy the
 * artifacts back into this app's `dist/` (plus `dist/smoke-mac.png`).
 *
 * The Mac needs Node ≥ 24 with npm, rsync and the Xcode Command Line Tools; `/opt/local/bin` (MacPorts),
 * `/opt/homebrew/bin` and `/usr/local/bin` are put on `PATH`, since a non-interactive SSH shell has only the system
 * dirs. The smoke test opens a window, so the SSH user must be logged in to the Mac's desktop (auto-login on a
 * headless Mac).
 *
 * Usage (from an app directory): `npx tsx ../../../scripts/release/build-mac-remote.ts [--no-smoke]`.
 * Environment: `FALANG_MAC_HOST` (SSH host, default `mac`), `FALANG_MAC_DIR` (checkout directory on the Mac, relative
 * to its home, default `falang-build.noindex` — the suffix keeps Spotlight from indexing the synced tree and its
 * node_modules, which on an 8 GB Mac starved the build of memory).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const host = process.env.FALANG_MAC_HOST ?? 'mac';
const remoteDir = process.env.FALANG_MAC_DIR ?? 'falang-build.noindex';
const smoke = !process.argv.includes('--no-smoke');

const REMOTE_PATH = '/opt/local/bin:/opt/local/sbin:/opt/homebrew/bin:/usr/local/bin:$PATH';
/** The file the previous sync's file list is kept in on the Mac, so files deleted here get deleted there. */
const MANIFEST = '.falang-mac-sync-files';
/** Where `npm ci` records the lockfile hash it installed, inside `node_modules` (so a wiped tree reinstalls). */
const LOCK_STAMP = 'node_modules/.falang-lock-sha256';

const appDir = process.cwd();
const workspace = (JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8')) as { name: string }).name;
const appKind = /^@falang\/desktop-app-(sketch|arduino|flow)$/.exec(workspace)?.[1];
if (!appKind)
  throw new Error(`build:mac-remote runs from packages/desktop/app-{sketch,arduino,flow}, not ${workspace}`);
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: appDir, encoding: 'utf8' }).trim();
const appRel = path.relative(repoRoot, appDir);

const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

/** Runs a shell script on the Mac (`bash -s`, script on stdin) and fails on a non-zero exit. */
const remote = (script: string, options: { input?: string; capture?: boolean } = {}): string => {
  const prelude = `set -euo pipefail\nexport PATH="${REMOTE_PATH}"\n`;
  // The script goes through `-c` so stdin stays free for `input`.
  const result = spawnSync('ssh', [host, `bash -c ${quote(prelude + script)}`], {
    input: options.input,
    encoding: 'utf8',
    stdio: [typeof options.input === 'string' ? 'pipe' : 'ignore', options.capture ? 'pipe' : 'inherit', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`remote step failed on ${host} (exit ${result.status})`);
  return result.stdout ?? '';
};

const rsyncPath = `PATH="${REMOTE_PATH}" rsync`;

const syncTree = (): void => {
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  const previous = remote(
    `mkdir -p ${quote(remoteDir)}; cat ${quote(`${remoteDir}/${MANIFEST}`)} 2>/dev/null || true`,
    {
      capture: true,
    },
  )
    .split('\0')
    .filter(Boolean);
  const current = new Set(files);
  const removed = previous.filter((file) => !current.has(file));
  if (removed.length > 0) {
    console.log(`removing ${removed.length} file(s) deleted since the last sync`);
    remote(`cd ${quote(remoteDir)} && xargs -0 rm -f --`, { input: removed.join('\0') });
  }
  console.log(`syncing ${files.length} files to ${host}:${remoteDir}`);
  execFileSync(
    'rsync',
    ['-a', '--compress', '--from0', '--files-from=-', `--rsync-path=${rsyncPath}`, './', `${host}:${remoteDir}/`],
    { cwd: repoRoot, input: files.join('\0'), stdio: ['pipe', 'inherit', 'inherit'] },
  );
  remote(`cat > ${quote(`${remoteDir}/${MANIFEST}`)}`, { input: files.join('\0') });
};

const buildRemotely = (): void => {
  const lockHash = createHash('sha256')
    .update(readFileSync(path.join(repoRoot, 'package-lock.json')))
    .digest('hex');
  remote(`
cd ${quote(remoteDir)}
echo "node $(node -v), npm $(npm -v) on $(uname -m) macOS $(sw_vers -productVersion)"
# The renderer bundles (Monaco, antd, Lexical) need more than V8's default heap on an 8 GB Mac.
export NODE_OPTIONS=--max-old-space-size=4096
# No signing (ADR 0050 (private)): never pick up a keychain identity by accident.
export CSC_IDENTITY_AUTO_DISCOVERY=false
if [ "$(cat ${LOCK_STAMP} 2>/dev/null || true)" != ${quote(lockHash)} ]; then
  echo '--- npm ci'
  npm ci --no-audit --no-fund
  echo ${quote(lockHash)} > ${LOCK_STAMP}
fi
echo '--- prebuild:mac'
npm run prebuild:mac -w ${quote(workspace)}
echo '--- build'
npm run build -w ${quote(workspace)}
echo '--- electron-builder --mac --x64'
cd ${quote(appRel)}
rm -rf dist
npx electron-builder --mac --x64 --publish never
${smoke ? `cd - >/dev/null\necho '--- smoke test'\nnpx tsx scripts/release/smoke-desktop-app.ts ${appKind} --screenshot ${quote(`${appRel}/dist/smoke-mac.png`)}` : ''}
`);
};

const fetchArtifacts = (): void => {
  const localDist = path.join(appDir, 'dist');
  mkdirSync(localDist, { recursive: true });
  execFileSync(
    'rsync',
    [
      '-a',
      `--rsync-path=${rsyncPath}`,
      '--include=*.dmg',
      '--include=*.zip',
      '--include=*.blockmap',
      '--include=*.yml',
      '--include=smoke-mac.png',
      '--exclude=*',
      `${host}:${remoteDir}/${appRel}/dist/`,
      `${localDist}/`,
    ],
    { stdio: 'inherit' },
  );
  console.log(`artifacts in ${path.relative(process.cwd(), localDist) || '.'}/:`);
  for (const line of execFileSync('ls', ['-1', localDist], { encoding: 'utf8' }).split('\n')) {
    if (/\.(dmg|zip|png)$/.test(line)) console.log(`  ${line}`);
  }
};

syncTree();
buildRemotely();
fetchArtifacts();
