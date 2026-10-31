import { describe, expect, it } from 'vitest';
import { resolveBackendUrl } from './resolve-backend-url.js';

describe('resolveBackendUrl', () => {
  it('uses the page origin for same-origin', () => {
    expect(resolveBackendUrl('same-origin', 'http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
  });
  it('falls back to the default for same-origin without a window', () => {
    expect(resolveBackendUrl('same-origin', null)).toBe('http://localhost:4000');
  });
  it('passes an explicit URL through and defaults when unset', () => {
    expect(resolveBackendUrl('https://api.example.com', 'http://x')).toBe('https://api.example.com');
    expect(resolveBackendUrl(null, 'http://x')).toBe('http://localhost:4000');
  });
});
