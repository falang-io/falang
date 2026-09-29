import { describe, expect, it } from 'vitest';
import { resolveTriggerCredentialId } from './trigger-credential.js';

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
