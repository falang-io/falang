import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ArduinoCliStatusStore, type IArduinoCliApi } from './arduino-cli-status-store.js';
import { ArduinoCoresStore, type IArduinoCoresApi } from './arduino-cores-store.js';
import { ArduinoCliSettingsModalStore } from './arduino-cli-settings-store.js';
import type { IArduinoCliFullStatus } from '../../shared/arduino-cli-ipc-types.js';

const STATUS: IArduinoCliFullStatus = { available: true, source: 'system', serialMonitorSupported: true, busy: null };

const fakeCliApi = (overrides: Partial<IArduinoCliApi> = {}): IArduinoCliApi => ({
  getStatus: vi.fn().mockResolvedValue(STATUS),
  getSettings: vi.fn().mockResolvedValue({ source: 'system' }),
  setSettings: vi.fn().mockResolvedValue({ ok: true, settings: { source: 'system' } }),
  install: vi.fn().mockResolvedValue({ ok: true, version: '1.4.1' }),
  cancelInstall: vi.fn().mockResolvedValue(true),
  checkUpdates: vi.fn().mockResolvedValue({ checked: true }),
  onProgress: vi.fn().mockReturnValue(vi.fn()),
  onChanged: vi.fn().mockReturnValue(vi.fn()),
  ...overrides,
});

describe('ArduinoCliStatusStore', () => {
  it('records an install failure but not a cancel', async () => {
    const api = fakeCliApi({ install: vi.fn().mockResolvedValue({ ok: false, message: 'offline' }) });
    const store = new ArduinoCliStatusStore(() => api);
    expect(await store.install()).toBe(false);
    expect(store.installError).toBe('offline');
    expect(store.installing).toBe(false);
    api.install = vi.fn().mockResolvedValue({ ok: false, message: 'x', cancelled: true });
    expect(await store.install()).toBe(false);
    expect(store.installError).toBeNull();
  });

  it('subscribes once for several users and unsubscribes with the last', () => {
    const off = vi.fn();
    const api = fakeCliApi({ onProgress: vi.fn().mockReturnValue(off), onChanged: vi.fn().mockReturnValue(off) });
    const store = new ArduinoCliStatusStore(() => api);
    const stopA = store.start();
    const stopB = store.start();
    expect(api.onProgress).toHaveBeenCalledTimes(1);
    stopA();
    expect(off).not.toHaveBeenCalled();
    stopB();
    expect(off).toHaveBeenCalledTimes(2);
  });
});

describe('ArduinoCliSettingsModalStore', () => {
  it('downloads before saving "managed" when nothing is downloaded, then stores the settings', async () => {
    const api = fakeCliApi();
    const status = new ArduinoCliStatusStore(() => api);
    await status.refresh();
    const modal = new ArduinoCliSettingsModalStore(status);
    modal.setSource('managed');
    expect(await modal.save()).toBe(true);
    expect(api.install).toHaveBeenCalledTimes(1);
    expect(api.setSettings).toHaveBeenCalledWith({ source: 'managed', checkUpdates: true });
  });

  it('keeps the modal open and shows the message when the custom path is refused', async () => {
    const api = fakeCliApi({ setSettings: vi.fn().mockResolvedValue({ ok: false, message: 'did not run' }) });
    const status = new ArduinoCliStatusStore(() => api);
    await status.refresh();
    const modal = new ArduinoCliSettingsModalStore(status);
    modal.setSource('custom');
    modal.setCustomPath('/x');
    expect(await modal.save()).toBe(false);
    expect(modal.error).toBe('did not run');
  });
});

describe('ArduinoCoresStore', () => {
  const coreApi = (installed: boolean): IArduinoCoresApi => ({
    getStatus: vi
      .fn()
      .mockResolvedValue({ platformId: 'arduino:avr', boardLabel: 'Uno', installed, cliAvailable: true }),
    install: vi.fn().mockResolvedValue({ ok: true }),
    cancelInstall: vi.fn().mockResolvedValue(true),
    onOutput: vi.fn().mockReturnValue(vi.fn()),
  });

  it('is missing only when the CLI works and the core is absent', async () => {
    const store = new ArduinoCoresStore(() => coreApi(false));
    await store.refresh('arduino:avr:uno');
    expect(store.missing).toBe(true);
    const ok = new ArduinoCoresStore(() => coreApi(true));
    await ok.refresh('arduino:avr:uno');
    expect(ok.missing).toBe(false);
  });

  it('collects streamed output during an install', async () => {
    const api = coreApi(false);
    const listeners: ((line: { line: string; stream: 'stdout' }) => void)[] = [];
    api.onOutput = vi.fn().mockImplementation((listener) => {
      listeners.push(listener);
      return vi.fn();
    });
    api.install = vi.fn().mockImplementation(() => {
      for (const listener of listeners) listener({ line: 'Downloading', stream: 'stdout' });
      return Promise.resolve({ ok: true });
    });
    const store = new ArduinoCoresStore(() => api);
    await store.install('arduino:avr:uno');
    expect(store.output).toEqual(['Downloading']);
    expect(store.installing).toBe(false);
  });
});
