import { describe, expect, it } from 'vitest';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { buildMcpIntegrationInstance } from './mcp-integration-instance-tools.js';

const openai = {
  vendor: 'openai',
  builtInProvider: true,
  credentialFields: [
    { name: 'baseUrl', label: 'Base URL', kind: 'text' },
    { name: 'apiKey', label: 'API key', kind: 'secret' },
  ],
} as unknown as IWorkflowIntegration;

const telegram = {
  vendor: 'telegram',
  credentialFields: [{ name: 'botToken', label: 'Bot token', kind: 'secret' }],
} as unknown as IWorkflowIntegration;

const createId = () => 'id-1';

describe('buildMcpIntegrationInstance (ADR 0081)', () => {
  it('fills missing fields blank and keeps provided ones', () => {
    const built = buildMcpIntegrationInstance(
      { vendor: 'openai', name: 'AI', fields: { baseUrl: 'https://x', apiKey: { dev: 'k' } } },
      openai,
      false,
      createId,
    );
    expect(built).toEqual({
      ok: true,
      instance: {
        fields: { apiKey: { dev: 'k', prod: '' }, baseUrl: 'https://x' },
        id: 'id-1',
        name: 'AI',
        vendor: 'openai',
      },
    });
  });

  it('sets platformProvider only for a builtInProvider vendor with the provider configured', () => {
    const ok = buildMcpIntegrationInstance(
      { vendor: 'openai', name: 'AI', platformProvider: true },
      openai,
      true,
      createId,
    );
    expect(ok).toMatchObject({ ok: true, instance: { platformProvider: true } });

    expect(
      buildMcpIntegrationInstance({ vendor: 'openai', name: 'AI', platformProvider: true }, openai, false, createId),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/not configured/) });

    expect(
      buildMcpIntegrationInstance({ vendor: 'telegram', name: 'Bot', platformProvider: true }, telegram, true, createId),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/cannot use the built-in AI provider/) });
  });

  it('omits the flag when false, and refuses an unknown vendor', () => {
    const built = buildMcpIntegrationInstance(
      { vendor: 'openai', name: 'AI', platformProvider: false },
      openai,
      true,
      createId,
    );
    expect(built.ok && 'platformProvider' in built.instance).toBe(false);
    expect(buildMcpIntegrationInstance({ vendor: 'nope', name: 'X' }, undefined, true, createId)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Unknown vendor/),
    });
  });
});
