import { beforeEach, describe, expect, it } from 'vitest';
import { MagicInsertSetting } from './magic-insert-setting.js';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  });
});

describe('MagicInsertSetting', () => {
  it('defaults to on and persists per user', () => {
    const first = new MagicInsertSetting('u1');
    expect(first.enabled).toBe(true);
    first.setEnabled(false);
    expect(new MagicInsertSetting('u1').enabled).toBe(false);
    expect(new MagicInsertSetting('u2').enabled).toBe(true);
  });

  it('survives unavailable storage', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    const setting = new MagicInsertSetting('u1');
    expect(setting.enabled).toBe(true);
    expect(() => setting.setEnabled(false)).not.toThrow();
    expect(setting.enabled).toBe(false);
  });
});
