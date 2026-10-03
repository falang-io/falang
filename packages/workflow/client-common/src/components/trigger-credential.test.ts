import { describe, expect, it } from 'vitest';
import { buildTriggerCredentialOptions, resolveTriggerCredentialId } from './trigger-credential.js';

describe('resolveTriggerCredentialId', () => {
  it('returns the vendor id for a credential-less vendor with no explicit instance in the project', () => {
    const integration = { credentialFields: [], vendor: 'schedule' };
    expect(resolveTriggerCredentialId(integration, [])).toBe('schedule');
  });

  it('returns null for a vendor that needs real credentials, even with no instances', () => {
    const integration = {
      credentialFields: [{ kind: 'secret' as const, label: 'Token', name: 'botToken' }],
      vendor: 'telegram',
    };
    expect(resolveTriggerCredentialId(integration, [])).toBeNull();
  });

  it('returns null for a credential-less vendor once the project has an explicit instance of it (e.g. webhook)', () => {
    const integration = { credentialFields: [], vendor: 'webhook' };
    const instances = [{ id: 'webhook-1', vendor: 'webhook' }];
    expect(resolveTriggerCredentialId(integration, instances)).toBeNull();
  });

  it('ignores instances of other vendors', () => {
    const integration = { credentialFields: [], vendor: 'schedule' };
    const instances = [{ id: 'webhook-1', vendor: 'webhook' }];
    expect(resolveTriggerCredentialId(integration, instances)).toBe('schedule');
  });

  it('returns null when the integration is unknown/unresolved', () => {
    // oxlint-disable-next-line no-undefined -- exercising the documented "unresolved integration" input, not a mistaken omission.
    expect(resolveTriggerCredentialId(undefined, [])).toBeNull();
  });
});

describe('buildTriggerCredentialOptions', () => {
  const telegram = {
    credentialFields: [{ kind: 'secret' as const, label: 'Token', name: 'botToken' }],
    triggers: [{}] as never,
    vendor: 'telegram',
  };
  const schedule = { credentialFields: [], triggers: [{}] as never, vendor: 'schedule' };
  const webhook = { credentialFields: [], triggers: [{}] as never, vendor: 'webhook' };
  const noTriggers = { credentialFields: [], triggers: [] as never, vendor: 'http' };

  it('lists instances of vendors with triggers and implicit credential-less vendors separately', () => {
    const result = buildTriggerCredentialOptions(
      [telegram, schedule, webhook, noTriggers],
      [
        { id: 'c1', name: 'My bot', vendor: 'telegram' },
        { id: 'h1', name: 'Http', vendor: 'http' },
      ],
    );
    expect(result.instances.map((o) => o.credentialId)).toEqual(['c1']);
    expect(result.withoutCredentials.map((o) => [o.vendor, o.credentialId])).toEqual([
      ['schedule', 'schedule'],
      ['webhook', 'webhook'],
    ]);
  });

  it('offers an explicit webhook instance instead of the implicit entry', () => {
    const result = buildTriggerCredentialOptions([webhook], [{ id: 'w1', name: 'Hook', vendor: 'webhook' }]);
    expect(result.instances.map((o) => o.key)).toEqual(['instance:w1']);
    expect(result.withoutCredentials).toEqual([]);
  });
});
