import { describe, expect, it } from 'vitest';
import { resolveTemporalCli } from './resolve-temporal-cli.js';

const only =
  (...ok: string[]) =>
  (f: string) =>
    Promise.resolve(ok.includes(f));

describe('resolveTemporalCli', () => {
  it('prefers FALANG_TEMPORAL_CLI', async () => {
    const r = await resolveTemporalCli({
      env: { FALANG_TEMPORAL_CLI: '/x/temporal', PATH: '/usr/bin' },
      dataDir: '/d',
      platform: 'linux',
      isExecutable: only('/x/temporal', '/usr/bin/temporal'),
    });
    expect(r).toBe('/x/temporal');
  });
  it('falls back to PATH, then the managed copy, then null', async () => {
    const env = { PATH: '/a:/b' };
    expect(
      await resolveTemporalCli({
        env,
        dataDir: '/d',
        platform: 'linux',
        isExecutable: only('/b/temporal', '/d/bin/temporal'),
      }),
    ).toBe('/b/temporal');
    expect(
      await resolveTemporalCli({ env, dataDir: '/d', platform: 'linux', isExecutable: only('/d/bin/temporal') }),
    ).toBe('/d/bin/temporal');
    expect(await resolveTemporalCli({ env, dataDir: '/d', platform: 'linux', isExecutable: only() })).toBeNull();
  });
  it('ignores an unusable explicit path', async () => {
    const r = await resolveTemporalCli({
      env: { FALANG_TEMPORAL_CLI: '/nope', PATH: '/a' },
      dataDir: '/d',
      platform: 'linux',
      isExecutable: only('/a/temporal'),
    });
    expect(r).toBe('/a/temporal');
  });
});
