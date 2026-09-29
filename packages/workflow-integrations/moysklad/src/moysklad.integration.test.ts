import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { MOYSKLAD_CALL_METHOD_NAME, MOYSKLAD_VENDOR, moyskladIntegration } from './moysklad.integration.js';
import { MOYSKLAD_METHOD_STRUCT_ID, MOYSKLAD_ROUTES, MOYSKLAD_STRUCT_TYPES } from './moysklad.generated.js';

describe('moyskladIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([moyskladIntegration]);
    expect(configs.map((config) => config.name)).toEqual([MOYSKLAD_CALL_METHOD_NAME]);
  });

  it('moysklad-call-method data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(moyskladIntegration.actions[0]);
    const parsed = config.data?.type.parse({
      credentialId: 'cred-1',
      method: 'activateEmployee',
      data: '{}',
      resultVariable: 'result',
    });
    expect(parsed).toEqual({
      credentialId: 'cred-1',
      method: 'activateEmployee',
      data: '{}',
      resultVariable: 'result',
    });
  });

  it('emit() calls moyskladCallMethod with the resolved field expressions and assigns the result', () => {
    const emitted = moyskladIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      method: "'activateEmployee'",
      data: '{}',
      resultVariable: 'result',
    });
    expect(emitted).toBe("const result = await moyskladCallMethod('cred-1', 'activateEmployee', {});");
  });

  it('emit() omits the assignment when resultVariable is empty (node created but not yet configured)', () => {
    const emitted = moyskladIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      method: "'activateEmployee'",
      data: '{}',
      resultVariable: '',
    });
    expect(emitted).toBe("await moyskladCallMethod('cred-1', 'activateEmployee', {});");
  });

  it('declares no trigger — action-only, single generic "call method" action', () => {
    expect(moyskladIntegration.triggers).toEqual([]);
    expect(moyskladIntegration.actions).toHaveLength(1);
  });

  it('credentialFields declares a single secret access token (Bearer auth, no OAuth2)', () => {
    expect(moyskladIntegration.credentialFields).toEqual([
      { name: 'accessToken', label: 'Access token', kind: 'secret' },
    ]);
  });

  describe("the `data` field's expectedType — dynamic, keyed off the selected `method`", () => {
    const dataField = moyskladIntegration.actions[0].fields.find((field) => field.name === 'data');
    if (!dataField) throw new Error('data field not found');

    it('is a function, not a static TVariableInfo', () => {
      expect(typeof dataField.expectedType).toBe('function');
    });

    it('resolves to the struct type registered for a real, known method', () => {
      const resolver = dataField.expectedType as (fields: Record<string, string>) => unknown;
      const resolved = resolver({ method: 'activateEmployee' }) as { type: string; id: string };
      expect(resolved).toEqual({ type: 'struct', id: MOYSKLAD_METHOD_STRUCT_ID.activateEmployee });
    });

    it('falls back to undefined (bare enclosing scope) for an unknown/unselected method', () => {
      const resolver = dataField.expectedType as (fields: Record<string, string>) => unknown;
      expect(resolver({ method: '' })).toBeUndefined();
      expect(resolver({})).toBeUndefined();
      expect(resolver({ method: 'NotARealMethod' })).toBeUndefined();
    });
  });

  it('generated every method with an operationId into both the select options and the routing table', () => {
    const methodField = moyskladIntegration.actions[0].fields[1];
    expect(methodField.kind).toBe('select');
    expect(methodField.options?.length).toBe(Object.keys(MOYSKLAD_ROUTES).length);
    expect(Object.keys(MOYSKLAD_ROUTES).length).toBeGreaterThan(1000);
    expect(Object.keys(MOYSKLAD_METHOD_STRUCT_ID).length).toEqual(Object.keys(MOYSKLAD_ROUTES).length);
  });

  it("every route's baseUrl is МойСклад's single remap/1.2 host", () => {
    for (const route of Object.values(MOYSKLAD_ROUTES)) {
      expect(route.baseUrl).toBe('https://api.moysklad.ru/api/remap/1.2');
    }
  });

  it("a known method's route matches the spec's own path/verb", () => {
    expect(MOYSKLAD_ROUTES.activateEmployee).toMatchObject({
      httpMethod: 'PUT',
      path: '/entity/employee/{id}/access/activate',
      pathParams: ['id'],
    });
  });

  it('every generated struct type has a unique id — including the cyclic-allOf schemas the generator fix covers', () => {
    const ids = MOYSKLAD_STRUCT_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sharedActivityCode embeds the routing table and the env-aware credential resolver', () => {
    expect(moyskladIntegration.sharedActivityCode).toContain('const resolveMoyskladField');
    expect(moyskladIntegration.sharedActivityCode).toContain("process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev'");
    expect(moyskladIntegration.sharedActivityCode).toContain('const MOYSKLAD_ROUTES: Record<');
    expect(moyskladIntegration.sharedActivityCode).toContain('"activateEmployee"');
  });

  it('activityCode dispatches on route.httpMethod/path and sends a Bearer Authorization header', () => {
    expect(moyskladIntegration.actions[0].activityCode).toContain('export const moyskladCallMethod');
    expect(moyskladIntegration.actions[0].activityCode).toContain('MOYSKLAD_ROUTES[method]');
    expect(moyskladIntegration.actions[0].activityCode).toContain('Authorization: `Bearer ${accessToken}`');
  });

  it('vendor matches the constant used by the credential-ref field', () => {
    expect(moyskladIntegration.vendor).toBe(MOYSKLAD_VENDOR);
    expect(moyskladIntegration.actions[0].fields[0]).toMatchObject({ kind: 'credential-ref', vendor: MOYSKLAD_VENDOR });
  });
});
