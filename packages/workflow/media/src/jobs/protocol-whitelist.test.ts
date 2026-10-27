import { describe, expect, it } from 'vitest';
import { withProtocolWhitelist } from './protocol-whitelist.js';

describe('withProtocolWhitelist', () => {
  it('puts a whitelist before every -i', () => {
    const out = withProtocolWhitelist(['-i', 'a.mp4', '-i', 'b.mp4', '-filter_complex', 'x']);
    expect(out).toEqual([
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      'a.mp4',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      'b.mp4',
      '-filter_complex',
      'x',
    ]);
  });

  it('keeps input-side options before the whitelist/-i pair', () => {
    expect(withProtocolWhitelist(['-ss', '1', '-i', 'a.mp4'])).toEqual([
      '-ss',
      '1',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      'a.mp4',
    ]);
  });
});
