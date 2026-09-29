import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { TBANK_GET_STATEMENT_NAME, TBANK_VENDOR, tbankIntegration } from './tbank.integration.js';

describe('tbankIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([tbankIntegration]);
    expect(configs.map((config) => config.name)).toEqual([TBANK_GET_STATEMENT_NAME]);
  });

  it('tbank-get-statement data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(tbankIntegration.actions[0]);
    const parsed = config.data?.type.parse({
      accountNumber: '40702810000000000001',
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
      resultVariable: 'statement',
    });
    expect(parsed).toEqual({
      accountNumber: '40702810000000000001',
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
      resultVariable: 'statement',
    });
  });

  it('emit() calls tbankGetStatement with the resolved field expressions and assigns the result', () => {
    const emitted = tbankIntegration.actions[0].emit({
      accountNumber: "'40702810000000000001'",
      from: "'2026-01-01T00:00:00Z'",
      to: "'2026-02-01T00:00:00Z'",
      resultVariable: 'statement',
    });
    expect(emitted).toBe(
      "const statement = await tbankGetStatement('40702810000000000001', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');",
    );
  });

  it('emit() omits the assignment when resultVariable is empty (node created but not yet configured)', () => {
    const emitted = tbankIntegration.actions[0].emit({
      accountNumber: "'40702810000000000001'",
      from: "'2026-01-01T00:00:00Z'",
      to: "''",
      resultVariable: '',
    });
    expect(emitted).toBe("await tbankGetStatement('40702810000000000001', '2026-01-01T00:00:00Z', '');");
  });

  it('declares no credential fields — sandbox needs neither a token nor a certificate', () => {
    expect(tbankIntegration.credentialFields).toEqual([]);
  });

  it('declares no trigger — action-only, like amoCRM/GigaChat/OpenAI', () => {
    expect(tbankIntegration.triggers).toEqual([]);
  });

  it('has no credential-ref field — the sandbox action needs no connected account', () => {
    expect(tbankIntegration.actions[0].fields.some((field) => field.kind === 'credential-ref')).toBe(false);
  });

  it('activityCode targets the sandbox path prefix on the production host, not a separate host', () => {
    expect(tbankIntegration.actions[0].activityCode).toContain(
      'https://business.tbank.ru/openapi/sandbox/api/v1/statement',
    );
  });

  it('activityCode uses the non-deprecated /api/v1/statement endpoint, not the deprecated bank-statement one', () => {
    expect(tbankIntegration.actions[0].activityCode).not.toContain('bank-statement');
  });

  it('activityCode authorizes with the literal, publicly-documented sandbox token', () => {
    expect(tbankIntegration.actions[0].activityCode).toContain("Authorization: 'Bearer TBankSandboxToken'");
  });

  it('vendor matches the constant used by the action', () => {
    expect(tbankIntegration.vendor).toBe(TBANK_VENDOR);
  });
});
