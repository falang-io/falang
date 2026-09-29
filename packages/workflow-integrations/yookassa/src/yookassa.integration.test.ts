import { buildTriggerNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import {
  YOOKASSA_SIGNAL_NAME,
  YOOKASSA_TRIGGER_NAME,
  YOOKASSA_VENDOR,
  yookassaIntegration,
} from './yookassa.integration.js';

describe('yookassaIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([yookassaIntegration]);
    expect(configs.map((config) => config.name)).toEqual([YOOKASSA_TRIGGER_NAME]);
  });

  it('declares two credential fields (shop_id/secret_key) and no actions — trigger-only', () => {
    expect(yookassaIntegration.credentialFields).toEqual([
      { name: 'shop_id', label: 'Shop ID', kind: 'text' },
      { name: 'secret_key', label: 'Secret key', kind: 'secret' },
    ]);
    expect(yookassaIntegration.actions).toEqual([]);
  });

  it('yookassa-trigger has no editable data', () => {
    const config = buildTriggerNodeConfig(yookassaIntegration.triggers[0]);
    expect(config).toEqual({ name: YOOKASSA_TRIGGER_NAME });
  });

  it('yookassa-trigger scopeType is untyped for now — confirmed object shape varies (payment vs. refund)', () => {
    expect(yookassaIntegration.triggers[0].scopeType).toEqual({ type: 'any' });
  });

  it('yookassa-trigger signal/scope naming', () => {
    expect(yookassaIntegration.triggers[0].signalName).toBe(YOOKASSA_SIGNAL_NAME);
    expect(yookassaIntegration.triggers[0].scopeVariableName).toBe('event');
  });

  it('vendor matches the constant used by the credential field', () => {
    expect(yookassaIntegration.vendor).toBe(YOOKASSA_VENDOR);
  });

  it('registers a registerBackend implementation, unlike an action-only vendor', () => {
    expect(yookassaIntegration.registerBackend).toBeInstanceOf(Function);
  });
});
