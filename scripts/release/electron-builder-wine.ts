// oxlint-disable no-console -- this is a CLI: console is its output.
/**
 * Packages the desktop app in the current directory for Windows (NSIS installer, x64, unsigned) on a Linux machine
 * through Wine — the `build:wine` script of every `packages/desktop/app-*`. The native route (`build:win` on a
 * Windows machine, the `win` job of `.github/workflows/desktop-release.yml`) is unchanged.
 *
 * electron-builder itself can target Windows from Linux; it needs Wine only to run the Windows tools on the `.exe`
 * (`rcedit`: icon and version info). The NSIS compiler it downloads has a Linux build. Native modules are not
 * rebuilt (`npmRebuild: false` in every app), so each one must ship a win32 prebuild — `@serialport/bindings-cpp`
 * (app-arduino) does; app-flow's `backend-dist` is installed for win32 by its `prebuild:wine` hook.
 *
 * Usage (from an app directory, after `electron-vite build`): `npx tsx ../../../scripts/release/electron-builder-wine.ts
 * [extra electron-builder args]`. Wine is taken from `PATH`; `WINEPREFIX` is respected (default `~/.wine`).
 */
import { execFileSync } from 'node:child_process';

if (process.platform === 'win32') {
  throw new Error('build:wine is for Linux hosts; on Windows use `npm run build:win`.');
}

const readWineVersion = (): string => {
  try {
    return execFileSync('wine', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    throw new Error(
      'Wine is not installed or not on PATH (e.g. `sudo apt install wine64`); it is needed to edit the .exe.',
    );
  }
};
console.log(`using ${readWineVersion()}`);

const env: NodeJS.ProcessEnv = {
  ...process.env,
  // Quiet Wine's own diagnostics, and don't let the first run of a fresh prefix ask to install Mono/Gecko.
  WINEDEBUG: process.env.WINEDEBUG ?? '-all',
  WINEDLLOVERRIDES: process.env.WINEDLLOVERRIDES ?? 'mscoree,mshtml=',
  // No signing (ADR 0050 (private)): never pick up a certificate from the environment by accident.
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
};

execFileSync('npx', ['electron-builder', '--win', '--x64', '--publish', 'never', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
