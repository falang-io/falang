import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { WILDBERRIES_CALL_METHOD_NAME, WILDBERRIES_VENDOR, wildberriesIntegration } from './wildberries.integration.js';
import { WILDBERRIES_METHOD_STRUCT_ID, WILDBERRIES_ROUTES, WILDBERRIES_STRUCT_TYPES } from './wildberries.generated.js';

describe('wildberriesIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([wildberriesIntegration]);
    expect(configs.map((config) => config.name)).toEqual([WILDBERRIES_CALL_METHOD_NAME]);
  });

  it('wildberries-call-method data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(wildberriesIntegration.actions[0]);
    const parsed = config.data?.type.parse({
      credentialId: 'cred-1',
      method: 'getV1Balance',
      data: '{}',
      resultVariable: 'balance',
    });
    expect(parsed).toEqual({
      credentialId: 'cred-1',
      method: 'getV1Balance',
      data: '{}',
      resultVariable: 'balance',
    });
  });

  it('emit() calls wildberriesCallMethod with the resolved field expressions and assigns the result', () => {
    const emitted = wildberriesIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      method: "'getV1Balance'",
      data: '{}',
      resultVariable: 'balance',
    });
    expect(emitted).toBe("const balance = await wildberriesCallMethod('cred-1', 'getV1Balance', {});");
  });

  it('emit() omits the assignment when resultVariable is empty (node created but not yet configured)', () => {
    const emitted = wildberriesIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      method: "'getV1Balance'",
      data: '{}',
      resultVariable: '',
    });
    expect(emitted).toBe("await wildberriesCallMethod('cred-1', 'getV1Balance', {});");
  });

  it('declares no trigger — action-only, single generic "call method" action', () => {
    expect(wildberriesIntegration.triggers).toEqual([]);
    expect(wildberriesIntegration.actions).toHaveLength(1);
  });

  it('credentialFields declares a single secret API token (raw-token auth, no OAuth2)', () => {
    expect(wildberriesIntegration.credentialFields).toEqual([{ name: 'apiToken', label: 'API-токен', kind: 'secret' }]);
  });

  describe("the `data` field's expectedType — dynamic, keyed off the selected `method`", () => {
    const dataField = wildberriesIntegration.actions[0].fields.find((field) => field.name === 'data');
    if (!dataField) throw new Error('data field not found');

    it('is a function, not a static TVariableInfo', () => {
      expect(typeof dataField.expectedType).toBe('function');
    });

    it('resolves to the struct type registered for a real, known method', () => {
      const resolver = dataField.expectedType as (fields: Record<string, string>) => unknown;
      const resolved = resolver({ method: 'getV1Balance' }) as { type: string; id: string };
      expect(resolved).toEqual({ type: 'struct', id: WILDBERRIES_METHOD_STRUCT_ID.getV1Balance });
    });

    it('falls back to undefined (bare enclosing scope) for an unknown/unselected method', () => {
      const resolver = dataField.expectedType as (fields: Record<string, string>) => unknown;
      expect(resolver({ method: '' })).toBeUndefined();
      expect(resolver({})).toBeUndefined();
      expect(resolver({ method: 'NotARealMethod' })).toBeUndefined();
    });
  });

  it('generated every method with an operationId into both the select options and the routing table, with no duplicate operationIds across the 13 category files', () => {
    const methodField = wildberriesIntegration.actions[0].fields[1];
    expect(methodField.kind).toBe('select');
    expect(methodField.options?.length).toBe(Object.keys(WILDBERRIES_ROUTES).length);
    expect(Object.keys(WILDBERRIES_ROUTES).length).toBeGreaterThan(250);
    expect(Object.keys(WILDBERRIES_METHOD_STRUCT_ID).length).toEqual(Object.keys(WILDBERRIES_ROUTES).length);
  });

  it("a known method's route reflects Wildberries' own per-category host, not one shared vendor-wide baseUrl", () => {
    expect(WILDBERRIES_ROUTES.getV1Balance).toMatchObject({
      httpMethod: 'GET',
      path: '/adv/v1/balance',
      baseUrl: 'https://advert-api.wildberries.ru',
    });
  });

  it('every route resolved to a real host — the path-level `servers`/most-common-host fallback never leaves one unset', () => {
    for (const route of Object.values(WILDBERRIES_ROUTES)) {
      expect(route.baseUrl).toMatch(/^https:\/\/.+\.wildberries\.ru$/);
    }
  });

  it('every generated struct type has a unique id', () => {
    const ids = WILDBERRIES_STRUCT_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sharedActivityCode embeds the routing table and the env-aware credential resolver', () => {
    expect(wildberriesIntegration.sharedActivityCode).toContain('const resolveWildberriesField');
    expect(wildberriesIntegration.sharedActivityCode).toContain("process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev'");
    expect(wildberriesIntegration.sharedActivityCode).toContain('const WILDBERRIES_ROUTES: Record<');
    expect(wildberriesIntegration.sharedActivityCode).toContain('"getV1Balance"');
  });

  it('activityCode dispatches on route.httpMethod/path and sends a raw (non-Bearer) Authorization header', () => {
    expect(wildberriesIntegration.actions[0].activityCode).toContain('export const wildberriesCallMethod');
    expect(wildberriesIntegration.actions[0].activityCode).toContain('WILDBERRIES_ROUTES[method]');
    expect(wildberriesIntegration.actions[0].activityCode).toContain('Authorization: apiToken');
    expect(wildberriesIntegration.actions[0].activityCode).not.toContain('Bearer');
  });

  it('vendor matches the constant used by the credential-ref field', () => {
    expect(wildberriesIntegration.vendor).toBe(WILDBERRIES_VENDOR);
    expect(wildberriesIntegration.actions[0].fields[0]).toMatchObject({
      kind: 'credential-ref',
      vendor: WILDBERRIES_VENDOR,
    });
  });
});
