import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { OZON_CALL_METHOD_NAME, OZON_VENDOR, ozonIntegration } from './ozon.integration.js';
import { OZON_METHOD_STRUCT_ID, OZON_ROUTES, OZON_STRUCT_TYPES } from './ozon.generated.js';

describe('ozonIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([ozonIntegration]);
    expect(configs.map((config) => config.name)).toEqual([OZON_CALL_METHOD_NAME]);
  });

  it('ozon-call-method data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(ozonIntegration.actions[0]);
    const parsed = config.data?.type.parse({
      credentialId: 'cred-1',
      method: 'SellerAPI_SellerInfo',
      data: '{}',
      resultVariable: 'info',
    });
    expect(parsed).toEqual({
      credentialId: 'cred-1',
      method: 'SellerAPI_SellerInfo',
      data: '{}',
      resultVariable: 'info',
    });
  });

  it('emit() calls ozonCallMethod with the resolved field expressions and assigns the result', () => {
    const emitted = ozonIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      method: "'SellerAPI_SellerInfo'",
      data: '{}',
      resultVariable: 'info',
    });
    expect(emitted).toBe("const info = await ozonCallMethod('cred-1', 'SellerAPI_SellerInfo', {});");
  });

  it('emit() omits the assignment when resultVariable is empty (node created but not yet configured)', () => {
    const emitted = ozonIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      method: "'SellerAPI_SellerInfo'",
      data: '{}',
      resultVariable: '',
    });
    expect(emitted).toBe("await ozonCallMethod('cred-1', 'SellerAPI_SellerInfo', {});");
  });

  it('declares no trigger — action-only, single generic "call method" action', () => {
    expect(ozonIntegration.triggers).toEqual([]);
    expect(ozonIntegration.actions).toHaveLength(1);
  });

  it("credentialFields declares clientId/apiKey (Ozon's Client-Id/Api-Key headers), only apiKey a secret", () => {
    expect(ozonIntegration.credentialFields).toEqual([
      { name: 'clientId', label: 'Client-Id', kind: 'text' },
      { name: 'apiKey', label: 'Api-Key', kind: 'secret' },
    ]);
  });

  describe("the `data` field's expectedType — dynamic, keyed off the selected `method`", () => {
    const dataField = ozonIntegration.actions[0].fields.find((field) => field.name === 'data');
    if (!dataField) throw new Error('data field not found');

    it('is a function, not a static TVariableInfo', () => {
      expect(typeof dataField.expectedType).toBe('function');
    });

    it('resolves to the struct type registered for a real, known method', () => {
      const resolver = dataField.expectedType as (fields: Record<string, string>) => unknown;
      const resolved = resolver({ method: 'SellerAPI_SellerInfo' }) as { type: string; id: string };
      expect(resolved).toEqual({ type: 'struct', id: OZON_METHOD_STRUCT_ID.SellerAPI_SellerInfo });
    });

    it('falls back to undefined (bare enclosing scope) for an unknown/unselected method', () => {
      const resolver = dataField.expectedType as (fields: Record<string, string>) => unknown;
      expect(resolver({ method: '' })).toBeUndefined();
      expect(resolver({})).toBeUndefined();
      expect(resolver({ method: 'NotARealMethod' })).toBeUndefined();
    });
  });

  it('generated every method with an operationId into both the select options and the routing table', () => {
    const methodField = ozonIntegration.actions[0].fields[1];
    expect(methodField.kind).toBe('select');
    expect(methodField.options?.length).toBe(Object.keys(OZON_ROUTES).length);
    expect(Object.keys(OZON_ROUTES).length).toBeGreaterThan(400);
    expect(Object.keys(OZON_METHOD_STRUCT_ID).length).toEqual(Object.keys(OZON_ROUTES).length);
  });

  it("every route's baseUrl is Ozon's single seller-api host", () => {
    for (const route of Object.values(OZON_ROUTES)) {
      expect(route.baseUrl).toBe('https://api-seller.ozon.ru');
    }
  });

  it('every generated struct type has a unique id', () => {
    const ids = OZON_STRUCT_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sharedActivityCode embeds the routing table and the env-aware credential resolver', () => {
    expect(ozonIntegration.sharedActivityCode).toContain('const resolveOzonField');
    expect(ozonIntegration.sharedActivityCode).toContain("process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev'");
    expect(ozonIntegration.sharedActivityCode).toContain('const OZON_ROUTES: Record<');
    expect(ozonIntegration.sharedActivityCode).toContain('"SellerAPI_SellerInfo"');
  });

  it('activityCode dispatches on route.httpMethod/path and sends Client-Id/Api-Key headers', () => {
    expect(ozonIntegration.actions[0].activityCode).toContain('export const ozonCallMethod');
    expect(ozonIntegration.actions[0].activityCode).toContain('OZON_ROUTES[method]');
    expect(ozonIntegration.actions[0].activityCode).toContain("'Client-Id': clientId, 'Api-Key': apiKey");
  });

  it('vendor matches the constant used by the credential-ref field', () => {
    expect(ozonIntegration.vendor).toBe(OZON_VENDOR);
    expect(ozonIntegration.actions[0].fields[0]).toMatchObject({ kind: 'credential-ref', vendor: OZON_VENDOR });
  });
});
