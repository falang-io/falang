import { describe, expect, it } from 'vitest';
import type { ISandboxBotAdapter } from '@falang/workflow-integrations-common';
import {
  findSandboxPlatform,
  formatRemaining,
  isDevTokenOptional,
  isExpired,
  resolveDevSandbox,
  sandboxErrorKey,
  shouldShowSandboxSwitch,
} from './sandbox-bots-model.js';

const sandbox = { tokenField: 'botToken' } as unknown as ISandboxBotAdapter;
const withSandbox = { vendor: 'telegram', sandbox };
const withoutSandbox: { vendor: string; sandbox?: undefined } = { vendor: 'http-request' };
const platforms = [{ vendor: 'telegram', username: 'bot', title: 'Test bot' }];

describe('sandbox switch visibility', () => {
  it('shows only for a sandbox vendor with a configured platform', () => {
    expect(shouldShowSandboxSwitch(withSandbox, platforms)).toBe(true);
    expect(findSandboxPlatform(withSandbox, platforms)?.title).toBe('Test bot');
    expect(shouldShowSandboxSwitch(withSandbox, [])).toBe(false);
    expect(shouldShowSandboxSwitch(withoutSandbox, platforms)).toBe(false);
    expect(shouldShowSandboxSwitch({ vendor: 'max', sandbox }, platforms)).toBe(false);
    expect(shouldShowSandboxSwitch(null, platforms)).toBe(false);
  });
});

describe('devSandbox helpers', () => {
  it('makes the dev token optional only in sandbox mode', () => {
    expect(isDevTokenOptional(withSandbox, true)).toBe(true);
    expect(isDevTokenOptional(withSandbox, false)).toBe(false);
    expect(isDevTokenOptional(withoutSandbox, true)).toBe(false);
  });

  it('stores only a true flag for a capable vendor', () => {
    expect(resolveDevSandbox(withSandbox, true)).toBe(true);
    expect(resolveDevSandbox(withSandbox, false)).toBe(false);
    expect(resolveDevSandbox(withoutSandbox, true)).toBe(false);
  });
});

describe('formatRemaining', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  it('formats minutes and seconds', () => {
    expect(formatRemaining('2026-01-01T00:14:05Z', now)).toBe('14:05');
    expect(formatRemaining('2026-01-01T00:00:09Z', now)).toBe('0:09');
  });
  it('clamps to zero after expiry', () => {
    expect(formatRemaining('2025-12-31T23:59:00Z', now)).toBe('0:00');
    expect(isExpired('2025-12-31T23:59:00Z', now)).toBe(true);
    expect(isExpired('2026-01-01T00:00:01Z', now)).toBe(false);
  });
});

describe('sandboxErrorKey', () => {
  it('maps known codes', () => {
    expect(sandboxErrorKey('sandbox_off')).toBe('sandbox-error-off');
    expect(sandboxErrorKey('sandbox_not_configured')).toBe('sandbox-error-not-configured');
    expect(sandboxErrorKey()).toBe('sandbox-error-generic');
  });
});
