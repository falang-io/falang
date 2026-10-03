// oxlint-disable no-undefined, unicorn/no-useless-undefined -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import { describe, expect, it } from 'vitest';
import { ProjectTokenService } from './project-token.service.js';

describe('ProjectTokenService (deterministic HMAC)', () => {
  it('derives the same token for the same project and secret — across instances, i.e. across restarts and replicas', () => {
    const first = new ProjectTokenService('secret-one');
    const afterRestart = new ProjectTokenService('secret-one');

    expect(first.getOrCreateToken('p1')).toBe(afterRestart.getOrCreateToken('p1'));
    expect(afterRestart.verify('p1', first.getOrCreateToken('p1'))).toBe(true);
  });

  it('gives each project its own token, and a different secret yields different tokens', () => {
    const service = new ProjectTokenService('secret-one');

    expect(service.getOrCreateToken('p1')).not.toBe(service.getOrCreateToken('p2'));
    expect(new ProjectTokenService('secret-two').getOrCreateToken('p1')).not.toBe(service.getOrCreateToken('p1'));
  });

  it("refuses a project's token for another project, a wrong-length token and an absent one", () => {
    const service = new ProjectTokenService('secret-one');
    const token = service.getOrCreateToken('p1');

    expect(service.verify('p2', token)).toBe(false);
    expect(service.verify('p1', token.slice(0, -1))).toBe(false);
    expect(service.verify('p1', `${token}0`)).toBe(false);
    expect(service.verify('p1', undefined)).toBe(false);
    expect(service.verify('p1', '')).toBe(false);
    expect(service.verify('', token)).toBe(false);
  });
});
