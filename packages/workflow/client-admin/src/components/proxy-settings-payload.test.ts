import { describe, expect, it } from 'vitest';
import { buildProxySettingsPayload } from './proxy-settings-payload.js';

describe('buildProxySettingsPayload', () => {
  it('omits a blank token so the stored one is kept', () => {
    expect(buildProxySettingsPayload({ url: ' https://p.example ', token: '  ', vendors: ['telegram'] })).toEqual({
      url: 'https://p.example',
      vendors: ['telegram'],
    });
  });

  it('includes a provided token', () => {
    expect(buildProxySettingsPayload({ url: 'https://p.example', token: 's3cret', vendors: [] })).toEqual({
      url: 'https://p.example',
      token: 's3cret',
      vendors: [],
    });
  });
});
