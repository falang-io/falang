import { createTriggerFunctionNode } from '@falang/workflow-dto';
import { bitrix24Integration } from '@falang/workflow-integrations-bitrix24';
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { webhookIntegration } from '@falang/workflow-integrations-webhook';
import { yookassaIntegration } from '@falang/workflow-integrations-yookassa';
import { describe, expect, it } from 'vitest';
import { buildTriggerAddresses } from './trigger-addresses.js';

const INTEGRATIONS = [telegramIntegration, webhookIntegration, bitrix24Integration, yookassaIntegration];

const trigger = (id: string, name: string, vendor: string, triggerName: string, credentialId: string) => ({
  id,
  name,
  root: createTriggerFunctionNode({
    vendor,
    triggerName,
    credentialId,
    scopeVariableName: 'event',
    scopeType: { type: 'any' },
  }),
});

describe('buildTriggerAddresses', () => {
  const documents = [
    trigger('doc-hook', 'onHook', 'webhook', 'webhook-trigger', 'webhook'),
    trigger('doc-b24', 'onLead', 'bitrix24', 'bitrix24-trigger', 'cred-b24'),
    trigger('doc-yk', 'onPayment', 'yookassa', 'yookassa-trigger', 'cred-yk'),
    trigger('doc-tg', 'onMessage', 'telegram', 'telegram-trigger', 'cred-tg'),
  ];

  it('lists the triggers whose URL the user pastes somewhere, with the gateway route per environment', () => {
    const addresses = buildTriggerAddresses({
      baseUrl: 'https://api.example.com/',
      projectId: 'p1',
      documents,
      integrations: INTEGRATIONS,
    });
    expect(addresses.map((address) => address.documentName)).toEqual(['onHook', 'onLead', 'onPayment']);
    expect(addresses[0]).toEqual({
      documentId: 'doc-hook',
      documentName: 'onHook',
      vendor: 'webhook',
      triggerName: 'webhook-trigger',
      devPath: '/webhooks/webhook/p1/webhook/dev/doc-hook',
      prodPath: '/webhooks/webhook/p1/webhook/prod/doc-hook',
      devUrl: 'https://api.example.com/webhooks/webhook/p1/webhook/dev/doc-hook',
      prodUrl: 'https://api.example.com/webhooks/webhook/p1/webhook/prod/doc-hook',
    });
    expect(addresses[1]?.prodUrl).toBe('https://api.example.com/webhooks/bitrix24/p1/cred-b24/prod/doc-b24');
  });

  it('leaves the full URLs empty when the server has no public address', () => {
    const [address] = buildTriggerAddresses({ baseUrl: null, projectId: 'p1', documents, integrations: INTEGRATIONS });
    expect(address?.devPath).toBe('/webhooks/webhook/p1/webhook/dev/doc-hook');
    expect(address?.devUrl).toBeNull();
  });

  it('skips unknown vendors, unknown trigger kinds and documents without a trigger body', () => {
    const addresses = buildTriggerAddresses({
      baseUrl: 'https://x',
      projectId: 'p1',
      documents: [
        trigger('a', 'a', 'gone', 'gone-trigger', 'c'),
        trigger('b', 'b', 'webhook', 'other-trigger', 'webhook'),
        { id: 'c', name: 'c', root: null },
      ],
      integrations: INTEGRATIONS,
    });
    expect(addresses).toEqual([]);
  });
});
