import { describe, expect, it } from 'vitest';
import { renderOAuth2CallbackPage } from './oauth2-callback-page.js';

const scriptOf = (page: string): string => page.slice(page.indexOf('<script>'), page.indexOf('</script>'));

describe('renderOAuth2CallbackPage', () => {
  const payloads = ['</script><script>alert(1)</script>', '"><img src=x onerror=alert(1)>', `'; alert(1); //`];

  it.each(payloads)('never lets %s break out of the markup or the script', (payload) => {
    const { html } = renderOAuth2CallbackPage({ status: 'error', credentialId: payload, message: payload });

    expect(html).not.toContain('<img');
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain('alert(1)</script>');
    expect(html).not.toContain(`"${payload}`);
    // the static script text does not depend on the input at all
    const withOther = renderOAuth2CallbackPage({ status: 'error', credentialId: 'x', message: 'y' }).html;
    expect(scriptOf(html)).toBe(scriptOf(withOther));
  });

  it('sets a CSP allowing only the hashed static script (no unsafe-inline)', () => {
    const { contentSecurityPolicy } = renderOAuth2CallbackPage({ status: 'success', credentialId: 'c' });

    expect(contentSecurityPolicy).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(contentSecurityPolicy).not.toContain('unsafe-inline');
    expect(contentSecurityPolicy).toContain("default-src 'none'");
  });

  it('carries the target origin as an escaped data attribute', () => {
    const { html } = renderOAuth2CallbackPage({
      status: 'success',
      credentialId: 'c',
      targetOrigin: 'https://app.test',
    });
    expect(html).toContain('data-target-origin="https://app.test"');
  });
});
