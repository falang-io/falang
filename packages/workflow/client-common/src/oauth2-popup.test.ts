import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openOAuth2Popup } from './oauth2-popup.js';

const ORIGIN = 'https://api.example.com';

describe('openOAuth2Popup', () => {
  let listeners = new Map<string, (e: unknown) => void>();
  let popup = { closed: false };
  let openResult: unknown = null;
  const removeEventListener = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = new Map();
    popup = { closed: false };
    openResult = popup;
    removeEventListener.mockReset();
    vi.stubGlobal('window', {
      open: vi.fn(() => openResult),
      addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
      removeEventListener: (type: string, fn: unknown) => {
        removeEventListener(type, fn);
        listeners.delete(type);
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const post = (origin: string, data: unknown): void => listeners.get('message')?.({ origin, data });

  it('resolves with an error when the popup is blocked', async () => {
    openResult = null;
    const result = await openOAuth2Popup('u', 'c1', ORIGIN);
    expect(result.status).toBe('error');
    expect(result.message).toMatch(/blocked/);
  });

  it('resolves with the callback message from the backend origin', async () => {
    const promise = openOAuth2Popup('u', 'c1', ORIGIN);
    post(ORIGIN, { type: 'falang-oauth2-callback', credentialId: 'c1', status: 'success' });
    expect(await promise).toMatchObject({ status: 'success' });
    expect(listeners.has('message')).toBe(false);
  });

  it('ignores messages from another origin, another type or another credential', async () => {
    const promise = openOAuth2Popup('u', 'c1', ORIGIN);
    post('https://evil.example', { type: 'falang-oauth2-callback', credentialId: 'c1', status: 'success' });
    post(ORIGIN, { type: 'other', credentialId: 'c1', status: 'success' });
    post(ORIGIN, { type: 'falang-oauth2-callback', credentialId: 'c2', status: 'success' });
    post(ORIGIN, null);
    expect(listeners.has('message')).toBe(true);
    post(ORIGIN, { type: 'falang-oauth2-callback', credentialId: 'c1', status: 'error', message: 'denied' });
    expect(await promise).toEqual({ status: 'error', message: 'denied' });
  });

  it('defaults a missing status to error', async () => {
    const promise = openOAuth2Popup('u', 'c1', ORIGIN);
    post(ORIGIN, { type: 'falang-oauth2-callback', credentialId: 'c1' });
    const result = await promise;
    expect(result.status).toBe('error');
  });

  it('resolves with an error when the popup is closed without an answer', async () => {
    const promise = openOAuth2Popup('u', 'c1', ORIGIN);
    await vi.advanceTimersByTimeAsync(1500);
    expect(listeners.has('message')).toBe(true);
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result.status).toBe('error');
    expect(result.message).toMatch(/closed/);
    expect(listeners.has('message')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops polling once a message settled it', async () => {
    const promise = openOAuth2Popup('u', 'c1', ORIGIN);
    post(ORIGIN, { type: 'falang-oauth2-callback', credentialId: 'c1', status: 'success' });
    await promise;
    expect(vi.getTimerCount()).toBe(0);
  });
});
