import type { IProjectDocument } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { resolveStartDeliveryArgs } from './start-delivery-args.js';

const scheduleIntegration: IWorkflowIntegration = {
  vendor: 'schedule',
  label: 'Schedule',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [
    {
      name: 'schedule-interval',
      label: 'Every N minutes',
      notes: 'Fires on a fixed interval.',
      scopeType: { type: 'any' },
      scopeVariableName: 'fire',
      signalName: 'scheduleFire',
      webhookPath: '/webhooks/schedule/:credentialId/:env',
      delivery: 'start',
    },
  ],
  actions: [],
};

const telegramIntegration: IWorkflowIntegration = {
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [
    {
      name: 'telegram-trigger',
      label: 'On message',
      notes: 'Fires for every incoming message.',
      scopeType: { type: 'any' },
      scopeVariableName: 'message',
      signalName: 'telegramMessage',
      webhookPath: '/webhooks/telegram/:credentialId/:env',
      // `delivery` omitted — defaults to 'signal'.
    },
  ],
  actions: [],
};

const integrations: readonly IWorkflowIntegration[] = [scheduleIntegration, telegramIntegration];

const buildTriggerFunctionDocument = (
  bodyData: Record<string, unknown>,
  overrides: Partial<IProjectDocument> = {},
): IProjectDocument => ({
  id: 'doc-1',
  type: TRIGGER_FUNCTION_NAME,
  name: 'onSchedule',
  root: {
    id: 'root',
    name: TRIGGER_FUNCTION_NAME,
    children: [
      { id: 'header', name: 'function-header', data: '' },
      { id: 'body', name: 'trigger-function-body', data: bodyData },
      { id: 'footer', name: 'function-footer', data: '' },
    ],
  },
  ...overrides,
});

describe('resolveStartDeliveryArgs', () => {
  it('is always runnable for a plain function document, passing the client args through unchanged', () => {
    const document: IProjectDocument = { id: 'doc-1', type: 'function', name: 'myFn' };
    const clientArgs = [1, 'two', true];
    expect(resolveStartDeliveryArgs(document, integrations, clientArgs)).toEqual({ runnable: true, args: clientArgs });
  });

  it('is runnable for a trigger-function bound to a delivery: "start" trigger, synthesizing a fire payload', () => {
    const document = buildTriggerFunctionDocument({ vendor: 'schedule', triggerName: 'schedule-interval', credentialId: 'schedule' });
    const resolution = resolveStartDeliveryArgs(document, integrations, []);
    expect(resolution.runnable).toBe(true);
    expect(resolution.args).toHaveLength(1);
    const [fire] = resolution.args as [{ scheduledAt: string; timezone: string }];
    expect(typeof fire.scheduledAt).toBe('string');
    expect(new Date(fire.scheduledAt).toString()).not.toBe('Invalid Date');
    expect(fire.timezone).toBe('UTC');
  });

  it('uses triggerConfig.timezone when the trigger was configured with one', () => {
    const document = buildTriggerFunctionDocument({
      vendor: 'schedule',
      triggerName: 'schedule-interval',
      credentialId: 'schedule',
      triggerConfig: { timezone: 'Europe/Moscow' },
    });
    const resolution = resolveStartDeliveryArgs(document, integrations, []);
    const [fire] = resolution.args as [{ timezone: string }];
    expect(fire.timezone).toBe('Europe/Moscow');
  });

  it('is not runnable for a trigger-function bound to a delivery: "signal" trigger (the default)', () => {
    const document = buildTriggerFunctionDocument({ vendor: 'telegram', triggerName: 'telegram-trigger', credentialId: 'cred-1' });
    expect(resolveStartDeliveryArgs(document, integrations, [])).toEqual({ runnable: false });
  });

  it('is not runnable for a trigger-function bound to an unknown vendor/trigger', () => {
    const document = buildTriggerFunctionDocument({ vendor: 'nope', triggerName: 'nope', credentialId: 'x' });
    expect(resolveStartDeliveryArgs(document, integrations, [])).toEqual({ runnable: false });
  });

  it('is not runnable for a trigger-function document with no root', () => {
    const document: IProjectDocument = { id: 'doc-1', type: TRIGGER_FUNCTION_NAME, name: 'onSchedule' };
    expect(resolveStartDeliveryArgs(document, integrations, [])).toEqual({ runnable: false });
  });

  it('is not runnable for any other document type', () => {
    const document: IProjectDocument = { id: 'doc-1', type: 'objects-structure', name: 'Types' };
    expect(resolveStartDeliveryArgs(document, integrations, [])).toEqual({ runnable: false });
  });
});
