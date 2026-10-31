import { describe, expect, it } from 'vitest';
import { parseStatus } from './status-file.js';

describe('parseStatus', () => {
  it('accepts a complete file and rejects garbage or a partial one', () => {
    const ok = { url: 'http://localhost:1', internalUrl: 'http://127.0.0.1:2', controlToken: 't' };
    expect(parseStatus(JSON.stringify(ok))?.controlToken).toBe('t');
    expect(parseStatus('{')).toBeNull();
    expect(parseStatus('{"url":"x"}')).toBeNull();
  });
});
