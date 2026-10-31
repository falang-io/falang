// oxlint-disable no-console, unicorn/no-process-exit -- a build CLI.
/** Builds the workflow client for the desktop shell (served from the backend's own origin): works on every OS. */
import { spawn } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const child = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'build', '-w', '@falang/workflow-client'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    // `.cmd` files need a shell on Windows.
    shell: process.platform === 'win32',
    env: { ...process.env, VITE_BACKEND_URL: 'same-origin' },
  },
);
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
