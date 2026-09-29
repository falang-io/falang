import { buildTriggerNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { WEBHOOK_SIGNAL_NAME, WEBHOOK_TRIGGER_NAME, webhookIntegration } from './webhook.integration.js';

describe('webhookIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([webhookIntegration]);
    expect(configs.map((config) => config.name)).toEqual([WEBHOOK_TRIGGER_NAME]);
  });

  it('declares no credential fields and no actions — trigger-only', () => {
    expect(webhookIntegration.credentialFields).toEqual([]);
    expect(webhookIntegration.actions).toEqual([]);
  });

  it('webhook-trigger has no editable data', () => {
    const config = buildTriggerNodeConfig(webhookIntegration.triggers[0]);
    expect(config).toEqual({ name: WEBHOOK_TRIGGER_NAME });
  });

  it('webhook-trigger scopeType is untyped for now (fast-follow, not a bare struct)', () => {
    expect(webhookIntegration.triggers[0].scopeType).toEqual({ type: 'any' });
  });

  it('webhook-trigger signal/scope naming', () => {
    expect(webhookIntegration.triggers[0].signalName).toBe(WEBHOOK_SIGNAL_NAME);
    expect(webhookIntegration.triggers[0].scopeVariableName).toBe('request');
  });

  it('registers a registerBackend implementation, unlike action-only vendors', () => {
    expect(webhookIntegration.registerBackend).toBeInstanceOf(Function);
  });
});
