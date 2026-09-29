import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GIT_VERSIONING_OPTIONS } from '@falang/desktop-project-fs';
import { getAgentSettings, getVersioningSettings, setAgentSettings, setVersioningSettings } from './settings.js';

// `main/settings.ts` reads `app.getPath('userData')` from `electron`, which has no real
// implementation to load outside an actual Electron process — mocked to a throwaway temp
// directory so this file's plain `fs` reads/writes exercise the real settings.json round trip.
// `app.getPath` is only ever called lazily, inside `settings.ts`'s own functions, so a plain static
// import above (evaluated before any test runs) never touches the not-yet-set `userDataDir`.
let userDataDir = '';
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
}));

describe('desktop-arduino main settings (ADR 0025 (private))', () => {
  beforeEach(async () => {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-arduino-settings-'));
  });

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true });
  });

  it('getVersioningSettings returns the default when nothing was ever saved', async () => {
    await expect(getVersioningSettings()).resolves.toEqual(DEFAULT_GIT_VERSIONING_OPTIONS);
  });

  it('setVersioningSettings persists, and getVersioningSettings round-trips it back', async () => {
    const custom = { repoMode: 'enclosing' as const, author: { name: 'Ada', email: 'ada@example.com' } };
    await setVersioningSettings(custom);
    await expect(getVersioningSettings()).resolves.toEqual(custom);
  });

  it('setVersioningSettings does not clobber a previously saved agent setting, and vice versa', async () => {
    const agent = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' };
    const versioning = { repoMode: 'private' as const, author: { name: 'Grace', email: 'grace@example.com' } };

    await setAgentSettings(agent);
    await setVersioningSettings(versioning);

    await expect(getAgentSettings()).resolves.toEqual(agent);
    await expect(getVersioningSettings()).resolves.toEqual(versioning);

    // The raw file itself must carry both keys side by side — the read-modify-write in `settings.ts`
    // is what this test is really guarding against regressing.
    const raw = JSON.parse(await fs.readFile(path.join(userDataDir, 'settings.json'), 'utf8')) as unknown;
    expect(raw).toEqual({ agent, versioning });
  });
});
