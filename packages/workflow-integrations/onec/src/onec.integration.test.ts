import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { ONEC_GET_RECORDS_NAME, ONEC_VENDOR, onecIntegration } from './onec.integration.js';

describe('onecIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([onecIntegration]);
    expect(configs.map((config) => config.name)).toEqual([ONEC_GET_RECORDS_NAME]);
  });

  it('onec-get-records data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(onecIntegration.actions[0]);
    const parsed = config.data?.type.parse({
      credentialId: 'cred-1',
      entity: 'Catalog_Контрагенты',
      filter: 'Post eq true',
      resultVariable: 'contractors',
    });
    expect(parsed).toEqual({
      credentialId: 'cred-1',
      entity: 'Catalog_Контрагенты',
      filter: 'Post eq true',
      resultVariable: 'contractors',
    });
  });

  it('emit() calls onecGetRecords with the resolved field expressions and assigns the result', () => {
    const emitted = onecIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      entity: '"Catalog_Контрагенты"',
      filter: '``',
      resultVariable: 'contractors',
    });
    expect(emitted).toBe('const contractors = await onecGetRecords(\'cred-1\', "Catalog_Контрагенты", ``);');
  });

  it('emit() omits the assignment when resultVariable is empty (node created but not yet configured)', () => {
    const emitted = onecIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      entity: '"Catalog_Контрагенты"',
      filter: '``',
      resultVariable: '',
    });
    expect(emitted).toBe('await onecGetRecords(\'cred-1\', "Catalog_Контрагенты", ``);');
  });

  it('credentialFields declares base_url/username/password, with only password hidden as a secret', () => {
    expect(onecIntegration.credentialFields).toEqual([
      { name: 'base_url', label: 'OData base URL (…/odata/standard.odata)', kind: 'text' },
      { name: 'username', label: 'Username', kind: 'text' },
      { name: 'password', label: 'Password', kind: 'secret' },
    ]);
  });

  it('declares no trigger — action-only, like amoCRM/GigaChat/OpenAI', () => {
    expect(onecIntegration.triggers).toEqual([]);
  });

  it('activityCode is a self-contained TS module fragment referencing the shared field resolver', () => {
    expect(onecIntegration.actions[0].activityCode).toContain('export const onecGetRecords');
    expect(onecIntegration.actions[0].activityCode).toContain("resolveOnecField(credentialId, 'base_url')");
    expect(onecIntegration.actions[0].activityCode).toContain('odata=nometadata');
  });

  it('sharedActivityCode resolves credential fields env-aware (dev/prod), not hardcoded to dev', () => {
    expect(onecIntegration.sharedActivityCode).toContain('const resolveOnecField');
    expect(onecIntegration.sharedActivityCode).toContain("process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev'");
    expect(onecIntegration.sharedActivityCode).toContain("vendor: 'onec'");
  });

  it('vendor matches the constant used by the credential-ref field', () => {
    expect(onecIntegration.vendor).toBe(ONEC_VENDOR);
    expect(onecIntegration.actions[0].fields[0]).toMatchObject({ kind: 'credential-ref', vendor: ONEC_VENDOR });
  });
});
