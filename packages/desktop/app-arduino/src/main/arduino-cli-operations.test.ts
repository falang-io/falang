// oxlint-disable no-promise-executor-return, no-undefined, consistent-function-scoping, no-useless-undefined -- test scaffolding: deferred promises
import { describe, expect, it, vi } from 'vitest';
import { ArduinoCliBusyError, ArduinoCliOperations } from './arduino-cli-operations.js';

describe('ArduinoCliOperations', () => {
  it('runs one exclusive operation, reports busy while it runs and idle after', async () => {
    const ops = new ArduinoCliOperations();
    const seen: (string | null)[] = [];
    ops.onChange((state) => seen.push(state.busy));
    let release: () => void = () => undefined;
    const running = ops.runExclusive('build', () => new Promise<string>((resolve) => (release = () => resolve('ok'))));
    expect(ops.getState()).toEqual({ busy: 'build' });
    release();
    expect(await running).toBe('ok');
    expect(ops.getState()).toEqual({ busy: null });
    expect(seen).toEqual(['build', null]);
  });

  it('refuses a second exclusive operation without running it or disturbing the first', async () => {
    const ops = new ArduinoCliOperations();
    let release: () => void = () => undefined;
    const first = ops.runExclusive('upload', () => new Promise<void>((resolve) => (release = resolve)));
    const second = vi.fn(() => Promise.resolve());
    await expect(ops.runExclusive('core-install', second)).rejects.toBeInstanceOf(ArduinoCliBusyError);
    expect(second).not.toHaveBeenCalled();
    expect(ops.getState()).toEqual({ busy: 'upload' });
    release();
    await first;
    expect(ops.getState()).toEqual({ busy: null });
  });

  it('frees the gate when the operation throws, and stops notifying an unsubscribed listener', async () => {
    const ops = new ArduinoCliOperations();
    const listener = vi.fn();
    const off = ops.onChange(listener);
    await expect(ops.runExclusive('cli-install', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(ops.getState()).toEqual({ busy: null });
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    await ops.runExclusive('build', () => Promise.resolve());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
