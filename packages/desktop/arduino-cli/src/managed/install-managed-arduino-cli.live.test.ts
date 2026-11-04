/* oxlint-disable no-console */
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execFileAsync } from '../exec-file-async.js';
import { installManagedArduinoCli } from './install-managed-arduino-cli.js';

// Opt-in: really downloads the current arduino-cli release (FALANG_ARDUINO_CLI_LIVE=1).
describe.skipIf(process.env.FALANG_ARDUINO_CLI_LIVE !== '1')('installManagedArduinoCli (live)', () => {
  it('installs the latest release for this machine', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-managed-live-'));
    try {
      const started = Date.now();
      const result = await installManagedArduinoCli({
        rootDir: root,
        fetch: (url, init) => fetch(url, init),
        platform: process.platform,
        arch: process.arch,
      });
      const outcome = await execFileAsync(result.path, ['version']);
      console.log(`live install: ${result.version} at ${result.path} in ${Date.now() - started} ms`);
      expect(outcome.ok).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});
