import { describe, expect, it, vi } from 'vitest';
import { createElectronDriverToolHost } from './electron-driver-tool-host.js';

const entry = (id: string, scope: 'bundled' | 'library' | 'project') =>
  ({ config: { id }, scope, status: 'ok' }) as never;
const okResult = { errors: [], ok: true, warnings: [] };

describe('createElectronDriverToolHost', () => {
  it('get picks the effective scope of the listed driver', async () => {
    const get = vi.fn().mockResolvedValue({ formatVersion: 1 });
    const host = createElectronDriverToolHost({
      ipc: { get, list: () => Promise.resolve({ drivers: [entry('a', 'library')] }), save: vi.fn(), validate: vi.fn() },
      refreshDrivers: vi.fn(),
    });
    await host.getDriver('a');
    expect(get).toHaveBeenCalledWith('a', 'library');
    await expect(host.getDriver('zzz')).rejects.toThrow(/zzz/);
  });

  it('setProjectDriver saves, then awaits refreshDrivers before resolving', async () => {
    const order: string[] = [];
    const host = createElectronDriverToolHost({
      ipc: {
        get: vi.fn(),
        list: vi.fn(),
        save: vi.fn(() => {
          order.push('save');
          return Promise.resolve(okResult);
        }),
        validate: vi.fn(),
      },
      refreshDrivers: async () => {
        await Promise.resolve();
        order.push('refresh');
      },
    });
    await host.setProjectDriver({});
    expect(order).toEqual(['save', 'refresh']);
  });

  it('does not refresh when the save was rejected', async () => {
    const refreshDrivers = vi.fn();
    const failed = { errors: [{ message: 'x', stage: 'schema' }], ok: false, warnings: [] };
    const host = createElectronDriverToolHost({
      ipc: { get: vi.fn(), list: vi.fn(), save: vi.fn().mockResolvedValue(failed), validate: vi.fn() },
      refreshDrivers,
    });
    expect(await host.setProjectDriver({})).toBe(failed);
    expect(refreshDrivers).not.toHaveBeenCalled();
  });
});
