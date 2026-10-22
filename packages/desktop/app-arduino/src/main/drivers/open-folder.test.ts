import { describe, expect, it } from 'vitest';
import { openFolder } from './open-folder.js';

const dirStat = () => Promise.resolve({ isDirectory: () => true });
const never = () =>
  new Promise<string>(() => {
    // never settles, like `shell.openPath` on Linux
  });

describe('openFolder', () => {
  it('returns null when openPath succeeds', async () => {
    expect(await openFolder('/d', { openPath: () => Promise.resolve(''), stat: dirStat })).toBeNull();
  });

  it('returns the error message openPath reports', async () => {
    const result = await openFolder('/d', { openPath: () => Promise.resolve('No application'), stat: dirStat });
    expect(result).toBe('No application');
  });

  it('treats an openPath that never settles as success after the timeout', async () => {
    expect(await openFolder('/d', { openPath: never, stat: dirStat, timeoutMs: 10 })).toBeNull();
  });

  it('reports a missing folder without calling openPath', async () => {
    let called = false;
    const result = await openFolder('/missing', {
      openPath: () => {
        called = true;
        return Promise.resolve('');
      },
      stat: () => Promise.reject(new Error('ENOENT')),
    });
    expect(result).toBe('Folder not found: /missing');
    expect(called).toBe(false);
  });
});
