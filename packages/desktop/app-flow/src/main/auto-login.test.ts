import { AUTH_TOKEN_STORAGE_KEY } from '@falang/workflow-client-common/src/auth-token-storage-key.js';
import { describe, expect, it } from 'vitest';
import { buildSetTokenScript } from './auto-login.js';

describe('buildSetTokenScript', () => {
  it('writes the token under the key the client reads', () => {
    expect(AUTH_TOKEN_STORAGE_KEY).toBe('falang-workflow-token');
    expect(buildSetTokenScript('a"b')).toBe(`localStorage.setItem("falang-workflow-token", "a\\"b");`);
  });
});
