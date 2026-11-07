// oxlint-disable no-bitwise, unicorn/no-await-expression-member
import { mkdtemp, readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeStatusFile, type ILocalStatus } from './status-file.js';

describe('writeStatusFile', () => {
  it('writes the existing fields plus services, atomically and with mode 0600', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'falang-status-'));
    const file = path.join(dir, 'nested', 'status.json');
    const status: ILocalStatus = {
      url: 'http://localhost:4000',
      internalUrl: 'http://127.0.0.1:3001',
      temporalAddress: '127.0.0.1:7233',
      temporalUiUrl: null,
      pid: 123,
      firstRun: true,
      controlToken: 'token',
      services: { mailpit: { testEnv: { MAILPIT_URL: 'http://127.0.0.1:8025' }, capabilities: ['mail'] } },
    };
    await writeStatusFile(file, status);
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    expect(parsed).toEqual(status);
    // The fields the desktop app reads (packages/desktop/app-flow/src/main/status-file.ts) keep their names and types.
    expect(Object.keys(parsed)).toEqual([
      'url',
      'internalUrl',
      'temporalAddress',
      'temporalUiUrl',
      'pid',
      'firstRun',
      'controlToken',
      'services',
    ]);
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readdir(path.dirname(file))).toEqual(['status.json']);
  });
});
