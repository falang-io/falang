import { describe, expect, it, vi } from 'vitest';
import { buildCorsOptions, resolveCorsOrigins } from './cors.js';

describe('cors', () => {
  it('prefers CORS_ORIGINS, then the CLIENT_PUBLIC_URL origin', () => {
    expect(
      resolveCorsOrigins({ CORS_ORIGINS: 'https://a.io/, https://b.io', CLIENT_PUBLIC_URL: 'https://c.io' }),
    ).toEqual(['https://a.io', 'https://b.io']);
    expect(resolveCorsOrigins({ CLIENT_PUBLIC_URL: 'https://c.io/app' })).toEqual(['https://c.io']);
    expect(resolveCorsOrigins({})).toBeNull();
  });
  it('is open with a single warning when nothing is configured', () => {
    const warn = vi.fn();
    expect(buildCorsOptions({}, warn)).toEqual({});
    buildCorsOptions({}, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(buildCorsOptions({ CORS_ORIGINS: 'https://a.io' }, warn)).toEqual({ origin: ['https://a.io'] });
  });
});
