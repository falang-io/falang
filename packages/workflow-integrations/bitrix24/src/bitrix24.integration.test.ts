import { buildTriggerNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import {
  BITRIX24_SIGNAL_NAME,
  BITRIX24_TRIGGER_NAME,
  BITRIX24_VENDOR,
  bitrix24Integration,
} from './bitrix24.integration.js';

describe('bitrix24Integration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([bitrix24Integration]);
    expect(configs.map((config) => config.name)).toEqual([BITRIX24_TRIGGER_NAME]);
  });

  it('declares one credential field (application_token) and no actions — trigger-only', () => {
    expect(bitrix24Integration.credentialFields).toEqual([
      { name: 'application_token', label: 'Outgoing webhook token (application_token)', kind: 'secret' },
    ]);
    expect(bitrix24Integration.actions).toEqual([]);
  });

  it('bitrix24-trigger has no editable data', () => {
    const config = buildTriggerNodeConfig(bitrix24Integration.triggers[0]);
    expect(config).toEqual({ name: BITRIX24_TRIGGER_NAME });
  });

  it('bitrix24-trigger scopeType is untyped for now — event payload shape varies per Bitrix24 event', () => {
    expect(bitrix24Integration.triggers[0].scopeType).toEqual({ type: 'any' });
  });

  it('bitrix24-trigger signal/scope naming', () => {
    expect(bitrix24Integration.triggers[0].signalName).toBe(BITRIX24_SIGNAL_NAME);
    expect(bitrix24Integration.triggers[0].scopeVariableName).toBe('event');
  });

  it('vendor matches the constant used by the credential field', () => {
    expect(bitrix24Integration.vendor).toBe(BITRIX24_VENDOR);
  });

  it('registers a registerBackend implementation, unlike an action-only vendor', () => {
    expect(bitrix24Integration.registerBackend).toBeInstanceOf(Function);
  });
});
