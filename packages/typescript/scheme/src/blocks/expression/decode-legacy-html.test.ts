import { describe, expect, it } from 'vitest';
import { decodeLegacyHtml } from './decode-legacy-html.js';

describe('decodeLegacyHtml', () => {
  it('decodes the entities innerHTML produced', () => {
    expect(decodeLegacyHtml('x &lt; 10 &amp;&amp; y &gt; 1')).toBe('x < 10 && y > 1');
  });
  it('decodes in a single pass', () => {
    expect(decodeLegacyHtml('&amp;lt;')).toBe('&lt;');
  });
  it('leaves plain code untouched', () => {
    expect(decodeLegacyHtml('x < 10 && s === "a"')).toBe('x < 10 && s === "a"');
  });
  it('is stable across repeated calls (global regexp state)', () => {
    expect(decodeLegacyHtml('a &lt; b')).toBe('a < b');
    expect(decodeLegacyHtml('a &lt; b')).toBe('a < b');
  });
});
