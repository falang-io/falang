// oxlint-disable unicorn/no-await-expression-member, init-declarations, no-bitwise, unicorn/no-array-sort, no-undefined, no-void
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

const load = () => import('./settings.js');

describe('settings', () => {
  beforeEach(async () => {
    userData = await mkdtemp(path.join(os.tmpdir(), 'falang-flow-settings-'));
  });

  it('reads {} when the file is missing', async () => {
    const { readSettings, getLanguage } = await load();
    expect(await readSettings()).toEqual({});
    expect(await getLanguage()).toBeNull();
  });

  it('round-trips and merges patches', async () => {
    const { readSettings, writeSettings, getLanguage } = await load();
    await writeSettings({ port: 1234 });
    await writeSettings({ language: 'ru' });
    expect(await readSettings()).toEqual({ port: 1234, language: 'ru' });
    expect(await getLanguage()).toBe('ru');
  });

  it('tolerates a corrupt file and overwrites it on the next write', async () => {
    const { readSettings, writeSettings } = await load();
    await writeFile(path.join(userData, 'settings.json'), '{oops');
    expect(await readSettings()).toEqual({});
    await writeSettings({ port: 5 });
    expect(await readSettings()).toEqual({ port: 5 });
  });

  it('creates the userData directory when it does not exist', async () => {
    const { readSettings, writeSettings } = await load();
    userData = path.join(userData, 'nested', 'dir');
    await writeSettings({ language: 'en' });
    expect(await readSettings()).toEqual({ language: 'en' });
  });
});
