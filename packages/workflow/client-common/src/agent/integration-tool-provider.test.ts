import { afterEach, describe, expect, it, vi } from 'vitest';
import { setDisabledVendors } from '../disabled-vendors.js';
import { INTEGRATIONS_DOCUMENT_TYPE, type IIntegrationInstance } from '@falang/workflow-integrations-common';
import type { WorkflowDocument } from '../workflow-types.js';
import type { WorkflowStore } from '../workflow-store.js';
import { IntegrationToolProvider } from './integration-tool-provider.js';

const TELEGRAM_VENDOR = 'telegram';

const call = (name: string, input: unknown) => ({ id: 'call-1', input, name });

const parseOk = (result: { ok: boolean; content?: string; error?: string }): unknown => {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return JSON.parse(result.content as string);
};

const withTelegramCredential = (): readonly WorkflowDocument[] => {
  const instance: IIntegrationInstance = {
    fields: { botToken: { dev: 'secret-dev', prod: 'secret-prod' } },
    id: 'cred-1',
    name: 'My bot',
    vendor: TELEGRAM_VENDOR,
  };
  return [
    {
      customData: { instances: [instance] },
      folderId: null,
      id: 'integrations-doc',
      name: 'integrations',
      pinned: true,
      type: INTEGRATIONS_DOCUMENT_TYPE,
    },
  ];
};

const buildStore = (documents: readonly WorkflowDocument[] = [], sandboxVendors: readonly string[] = []) => {
  const saveIntegrationInstance = vi.fn();
  const getSandboxVendors = () => sandboxVendors;
  const store = { documents, getSandboxVendors, saveIntegrationInstance } as unknown as WorkflowStore;
  return { saveIntegrationInstance, store };
};

describe('IntegrationToolProvider', () => {
  it('search_integrations finds vendors by keyword, with credential fields, triggers and node kinds', () => {
    const { store } = buildStore();
    const provider = new IntegrationToolProvider(store);

    const { vendors } = parseOk(provider.execute(call('search_integrations', { keywords: ['telegram'] }))) as {
      vendors: { vendor: string; nodeKinds: string[]; triggers: { name: string }[] }[];
    };

    expect(vendors[0]?.vendor).toBe(TELEGRAM_VENDOR);
    expect(vendors[0]?.nodeKinds).toContain('telegram-question');
    expect(vendors[0]?.triggers.map((trigger) => trigger.name)).toContain('telegram-on-command-trigger');
  });

  it('list_integration_instances never includes field values/secrets', () => {
    const { store } = buildStore(withTelegramCredential());
    const provider = new IntegrationToolProvider(store);

    const instances = parseOk(provider.execute(call('list_integration_instances', {}))) as Record<string, unknown>[];

    expect(instances).toEqual([{ id: 'cred-1', name: 'My bot', vendor: TELEGRAM_VENDOR }]);
    expect(instances[0].fields).toBeUndefined();
  });

  it('create_integration_instance without fields creates every field blank (secrets as {dev:"",prod:""})', () => {
    const { saveIntegrationInstance, store } = buildStore();
    const provider = new IntegrationToolProvider(store);

    const result = provider.execute(call('create_integration_instance', { name: 'My bot', vendor: TELEGRAM_VENDOR }));

    expect(parseOk(result)).toHaveProperty('instanceId');
    expect(saveIntegrationInstance).toHaveBeenCalledTimes(1);
    const saved = saveIntegrationInstance.mock.calls[0][0] as IIntegrationInstance;
    expect(saved.vendor).toBe(TELEGRAM_VENDOR);
    expect(saved.name).toBe('My bot');
    // Telegram's one credential field (`botToken`) is `kind: 'secret'` — blank means both dev/prod empty.
    expect(saved.fields).toEqual({ botToken: { dev: '', prod: '' } });
  });

  it('create_integration_instance with partial fields leaves the rest blank', () => {
    const { saveIntegrationInstance, store } = buildStore();
    const provider = new IntegrationToolProvider(store);

    provider.execute(
      call('create_integration_instance', {
        fields: { botToken: { dev: 'partial-dev' } },
        name: 'My bot',
        vendor: TELEGRAM_VENDOR,
      }),
    );

    const saved = saveIntegrationInstance.mock.calls[0][0] as IIntegrationInstance;
    expect(saved.fields.botToken).toEqual({ dev: 'partial-dev', prod: '' });
  });

  it('create_integration_instance rejects an unknown vendor without saving', () => {
    const { saveIntegrationInstance, store } = buildStore();
    const provider = new IntegrationToolProvider(store);

    const result = provider.execute(call('create_integration_instance', { name: 'x', vendor: 'no-such-vendor' }));

    expect(result.ok).toBe(false);
    expect(saveIntegrationInstance).not.toHaveBeenCalled();
  });
});

describe('IntegrationToolProvider — devSandbox (platform test bot)', () => {
  const create = (store: WorkflowStore, extra: Record<string, unknown>) =>
    new IntegrationToolProvider(store).execute(
      call('create_integration_instance', { name: 'Bot', vendor: TELEGRAM_VENDOR, ...extra }),
    );

  it('saves devSandbox when the vendor has a configured test bot', () => {
    const { saveIntegrationInstance, store } = buildStore([], [TELEGRAM_VENDOR]);
    expect(create(store, { devSandbox: true }).ok).toBe(true);
    const saved = saveIntegrationInstance.mock.calls[0][0] as IIntegrationInstance;
    expect(saved.devSandbox).toBe(true);
    expect(saved.fields).toEqual({ botToken: { dev: '', prod: '' } });
  });

  it('rejects devSandbox when the test bot is not configured', () => {
    const { saveIntegrationInstance, store } = buildStore();
    const result = create(store, { devSandbox: true });
    expect(result.ok).toBe(false);
    expect(saveIntegrationInstance).not.toHaveBeenCalled();
  });

  it('rejects devSandbox for a vendor without a sandbox adapter', () => {
    const { saveIntegrationInstance, store } = buildStore([], ['http-request']);
    const result = new IntegrationToolProvider(store).execute(
      call('create_integration_instance', { devSandbox: true, name: 'x', vendor: 'http-request' }),
    );
    expect(result.ok).toBe(false);
    expect(saveIntegrationInstance).not.toHaveBeenCalled();
  });

  it('does not set the flag when omitted or false', () => {
    const { saveIntegrationInstance, store } = buildStore([], [TELEGRAM_VENDOR]);
    create(store, { devSandbox: false });
    expect((saveIntegrationInstance.mock.calls[0][0] as IIntegrationInstance).devSandbox).toBeUndefined();
  });

  it('list_integration_instances shows devSandbox when set', () => {
    const docs = withTelegramCredential();
    (docs[0].customData as { instances: Record<string, unknown>[] }).instances[0].devSandbox = true;
    const { store } = buildStore(docs, [TELEGRAM_VENDOR]);
    const instances = parseOk(
      new IntegrationToolProvider(store).execute(call('list_integration_instances', {})),
    ) as Record<string, unknown>[];
    expect(instances[0]).toEqual({ devSandbox: true, id: 'cred-1', name: 'My bot', vendor: TELEGRAM_VENDOR });
  });
});

describe('IntegrationToolProvider — vendors disabled by the deployment', () => {
  afterEach(() => setDisabledVendors([]));

  it('search_integrations does not offer a disabled vendor (sqlite)', () => {
    const { store } = buildStore();
    const provider = new IntegrationToolProvider(store);
    const search = () =>
      (
        parseOk(provider.execute(call('search_integrations', { keywords: ['sqlite'] }))) as {
          vendors: { vendor: string }[];
        }
      ).vendors.map((item) => item.vendor);

    expect(search()).toContain('sqlite');
    setDisabledVendors(['sqlite']);
    expect(search()).not.toContain('sqlite');
  });

  it('create_integration_instance refuses a disabled vendor', () => {
    setDisabledVendors(['sqlite']);
    const { store, saveIntegrationInstance } = buildStore();
    const result = new IntegrationToolProvider(store).execute(
      call('create_integration_instance', { name: 'db', vendor: 'sqlite' }),
    );

    expect(result.ok).toBe(false);
    expect(saveIntegrationInstance).not.toHaveBeenCalled();
  });
});
