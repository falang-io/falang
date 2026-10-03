// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize-html.js';

describe('sanitizeHtml', () => {
  it('keeps editor formatting, lists, alignment, links and images', () => {
    const html =
      '<p style="text-align: center"><b>bold</b> <i>it</i> <u>u</u> <s>s</s></p><ul><li>a</li></ul>' +
      '<a href="https://example.com" title="t">l</a><img src="data:image/png;base64,AAAA" width="10" height="20" alt="x">' +
      '<img src="https://example.com/a.png">';
    const out = sanitizeHtml(html);
    expect(out).toContain('<b>bold</b>');
    expect(out).toContain('text-align: center');
    expect(out).toContain('<li>a</li>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('src="data:image/png;base64,AAAA"');
    expect(out).toContain('width="10"');
    expect(out).toContain('src="https://example.com/a.png"');
  });

  it('removes scripts, event handlers and javascript: URLs', () => {
    const out = sanitizeHtml(
      '<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a><p onclick="a()">p</p><iframe src="https://e.com"></iframe>',
    );
    expect(out).not.toMatch(/script|onerror|onclick|javascript:|iframe/i);
    expect(out).toContain('<p>p</p>');
  });

  it('removes dangerous inline CSS but keeps safe declarations', () => {
    const out = sanitizeHtml(
      '<p style="color: red; background: url(javascript:alert(1)); width: expression(alert(1))">x</p>',
    );
    expect(out).toContain('color: red');
    expect(out).not.toMatch(/url|expression|javascript/i);
  });

  it('rejects non-image data: URLs', () => {
    expect(sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>')).not.toContain('data:');
  });
});
