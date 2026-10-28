import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetPendingTemplate, readPendingTemplate, rememberPendingTemplate } from './pending-template.js';

describe('pending template', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('remembers a template for a week', () => {
    rememberPendingTemplate('telegram-bot-otzyvy', 1000);
    expect(readPendingTemplate(2000)).toBe('telegram-bot-otzyvy');
    expect(readPendingTemplate(1000 + 8 * 24 * 60 * 60 * 1000)).toBeNull();
    expect(readPendingTemplate(2000)).toBeNull();
  });

  it('forgets on request and copes without storage', () => {
    rememberPendingTemplate('x');
    forgetPendingTemplate();
    expect(readPendingTemplate()).toBeNull();
    vi.stubGlobal('localStorage', null);
    expect(() => rememberPendingTemplate('x')).not.toThrow();
    expect(readPendingTemplate()).toBeNull();
  });
});
