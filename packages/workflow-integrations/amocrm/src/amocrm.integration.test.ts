import {
  buildActionNodeConfig,
  getIntegrationNodeConfigs,
  type IActionDescriptor,
} from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { buildAmoCrmLocale } from './amocrm-locales.js';
import {
  AMOCRM_CALL_METHOD_NAME,
  AMOCRM_CREATE_LEAD_NAME,
  AMOCRM_FIND_LEADS_NAME,
  AMOCRM_VENDOR,
  amocrmIntegration,
} from './amocrm.integration.js';

const action = (name: string): IActionDescriptor => {
  const found = amocrmIntegration.actions.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no action ${name}`);
  return found;
};

/** What `@falang/workflow-compiler`'s `resolveFieldExpression` hands to `emit()` for a node's stored data. */
const compiledFields = (descriptor: IActionDescriptor, data: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    descriptor.fields.map((field) => {
      const raw = data[field.name] ?? '';
      if (field.kind === 'expression' || field.kind === 'new-variable') return [field.name, raw.trim()];
      if (field.kind === 'template-string') return [field.name, `\`${raw}\``];
      return [field.name, JSON.stringify(raw)];
    }),
  );

describe('amocrmIntegration', () => {
  it('produces valid node configs for every action through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([amocrmIntegration]);
    expect(configs.map((config) => config.name)).toEqual([
      ...amocrmIntegration.triggers.map((trigger) => trigger.name),
      ...amocrmIntegration.actions.map((descriptor) => descriptor.name),
    ]);
    expect(configs.map((config) => config.name)).toContain(AMOCRM_CREATE_LEAD_NAME);
    expect(configs.map((config) => config.name)).toContain(AMOCRM_CALL_METHOD_NAME);
  });

  it('every action has a unique, amocrm-prefixed activity whose name matches its signature and code', () => {
    const activityNames = amocrmIntegration.actions.map((descriptor) => descriptor.activitySignature.split('(')[0]);
    expect(new Set(activityNames).size).toBe(activityNames.length);
    for (const [index, descriptor] of amocrmIntegration.actions.entries()) {
      expect(activityNames[index]).toMatch(/^amocrm[A-Z]/);
      expect(descriptor.activityCode).toContain(`export const ${activityNames[index]} = async (`);
    }
  });

  it('every credential-ref field is restricted to the amocrm vendor', () => {
    for (const descriptor of amocrmIntegration.actions) {
      const credential = descriptor.fields.find((field) => field.kind === 'credential-ref');
      expect(credential).toMatchObject({ name: 'credentialId', vendor: AMOCRM_VENDOR });
    }
  });

  it('a create-lead node saved before the extra fields existed still compiles (blank expressions become undefined)', () => {
    const descriptor = action(AMOCRM_CREATE_LEAD_NAME);
    const emitted = descriptor.emit(
      compiledFields(descriptor, { credentialId: 'cred-1', name: 'New lead', price: '1000' }),
    );
    expect(emitted).toBe(
      'await amocrmCreateLead("cred-1", `New lead`, 1000, undefined, undefined, undefined, undefined);',
    );
  });

  it('create-lead with a result variable assigns the created id', () => {
    const descriptor = action(AMOCRM_CREATE_LEAD_NAME);
    const emitted = descriptor.emit(
      compiledFields(descriptor, {
        credentialId: 'cred-1',
        name: 'Order ${orderId}',
        price: 'total',
        pipelineId: '7',
        statusId: 'undefined',
        responsibleUserId: 'undefined',
        extra: '{}',
        resultVariable: 'lead',
      }),
    );
    expect(emitted).toBe(
      'const lead = await amocrmCreateLead("cred-1", `Order ${orderId}`, total, 7, undefined, undefined, {});',
    );
  });

  it('a create-lead node saved before the optional fields existed still parses, gaining their defaults', () => {
    const config = buildActionNodeConfig(action(AMOCRM_CREATE_LEAD_NAME));
    const legacy = { credentialId: 'cred-1', name: 'New lead', price: '1000' };
    expect(config.data?.type.parse(legacy)).toEqual({
      ...legacy,
      pipelineId: 'undefined',
      statusId: 'undefined',
      responsibleUserId: 'undefined',
      extra: '{}',
      resultVariable: '',
    });
    expect(() => config.data?.type.parse({ credentialId: 'cred-1', price: '1000' })).toThrow();
  });

  it('find-leads is typed as an array of amocrm/Lead', () => {
    expect(action(AMOCRM_FIND_LEADS_NAME).resultType).toEqual({
      type: 'array',
      elementType: { type: 'struct', id: 'amocrm/Lead' },
      dimensions: 1,
    });
  });

  it('call-method types `data` by the chosen method and emits the raw call', () => {
    const descriptor = action(AMOCRM_CALL_METHOD_NAME);
    const dataField = descriptor.fields.find((field) => field.name === 'data');
    const methodField = descriptor.fields.find((field) => field.name === 'method');
    const firstMethod = methodField?.options?.[0]?.value ?? '';
    expect(typeof dataField?.expectedType).toBe('function');
    if (typeof dataField?.expectedType !== 'function') return;
    expect(dataField.expectedType({ method: firstMethod })).toEqual({
      type: 'struct',
      id: `amocrm/params/${firstMethod}`,
    });
    expect(dataField.expectedType({ method: 'no-such-method' })).toBeUndefined();
    expect(descriptor.emit({ credentialId: '"cred-1"', method: '"getLeads"', data: '', resultVariable: 'leads' })).toBe(
      'const leads = await amocrmCallMethod("cred-1", "getLeads", {});',
    );
  });

  it('declares every struct type it references (actions, results and method params)', () => {
    const defined = new Set((amocrmIntegration.types ?? []).map((type) => type.id));
    const referenced = new Set<string>();
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (record.type === 'struct' && typeof record.id === 'string') referenced.add(record.id);
      for (const child of Object.values(record)) visit(child);
    };
    for (const type of amocrmIntegration.types ?? []) visit(type.properties);
    for (const trigger of amocrmIntegration.triggers) visit(trigger.scopeType);
    for (const descriptor of amocrmIntegration.actions) {
      visit(descriptor.resultType);
      for (const field of descriptor.fields) {
        if (typeof field.expectedType !== 'function') visit(field.expectedType);
      }
    }
    expect([...referenced].filter((id) => !defined.has(id))).toEqual([]);
    expect(new Set((amocrmIntegration.types ?? []).map((type) => type.name)).size).toBe(defined.size);
  });

  it('every label key used by an action or option has an en and ru translation without ":" in the text', () => {
    for (const language of ['en', 'ru'] as const) {
      const namespace = buildAmoCrmLocale(language).amocrm as Record<string, Record<string, string>>;
      const keys = new Set<string>();
      for (const trigger of amocrmIntegration.triggers) {
        keys.add(trigger.label);
        for (const field of trigger.contextFields ?? []) {
          keys.add(field.label);
          for (const option of field.options ?? []) keys.add(option.label);
        }
      }
      for (const descriptor of amocrmIntegration.actions) {
        keys.add(descriptor.label);
        for (const field of descriptor.fields) {
          keys.add(field.label);
          for (const option of field.options ?? []) keys.add(option.label);
        }
      }
      for (const key of keys) {
        const [ns, path] = key.split(':');
        expect(ns).toBe('amocrm');
        const [group, name] = path.split('.');
        const text = namespace[group]?.[name];
        expect(text, `${language}: ${key}`).toBeTruthy();
        expect(text).not.toContain(':');
      }
    }
  });

  it('uses the platform OAuth2 client: credentialFields are only the hidden OAuth2 token fields', () => {
    expect(amocrmIntegration.oauth2).toMatchObject({
      authUrl: 'https://www.amocrm.ru/oauth',
      tokenUrl: 'https://{accountDomain}/oauth2/access_token',
      tokenRequestFormat: 'json',
      accountDomainCallbackParam: 'referer',
      includeRedirectUriOnRefresh: true,
      platformClient: true,
    });
    expect(amocrmIntegration.credentialFields.every((field) => field.hidden)).toBe(true);
    expect(amocrmIntegration.credentialFields.map((field) => field.name)).toEqual([
      'access_token',
      'refresh_token',
      'expires_at',
      'account_domain',
    ]);
  });

  it('sharedActivityCode imports its helpers and inlines the runtime OAuth2 config verbatim', () => {
    const shared = amocrmIntegration.sharedActivityCode ?? '';
    expect(shared).toContain("import { ApplicationFailure } from '@temporalio/activity';");
    expect(shared).toContain("import { resolveOAuth2AccessToken } from '@falang/workflow-integrations-common';");
    expect(shared).toContain(
      JSON.stringify({
        tokenUrl: 'https://{accountDomain}/oauth2/access_token',
        tokenRequestFormat: 'json',
        accountDomainCallbackParam: 'referer',
        includeRedirectUriOnRefresh: true,
      }),
    );
    expect(shared).toContain("resolveOAuth2AccessToken('amocrm', credentialId,");
  });
});
