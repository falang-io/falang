import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { WEBHOOK_SCOPE_VARIABLE_NAME, WEBHOOK_SIGNAL_NAME, WEBHOOK_TRIGGER_NAME, WEBHOOK_VENDOR } from './constants.js';
import { registerWebhookBackend } from './webhook-backend.js';

export * from './constants.js';

/**
 * Generic inbound webhook trigger — the receiving counterpart to
 * `@falang/workflow-integrations-http-request`'s outbound HTTP Request action. No real external
 * provider, so `credentialFields: []` — an instance exists only to hand out a `credentialId`, which is
 * what makes this trigger's URL (`/webhooks/webhook/:projectId/:credentialId/:env/:triggerFunctionId`) unique.
 *
 * `scopeType: { type: 'any' }` for now (mirrors `telegram-trigger`'s original shape before it got a
 * typed `TelegramMessage` struct, see `@falang/workflow-integrations-telegram`) — a fast-follow, not
 * required to demonstrate "any inbound HTTP call can wake a workflow".
 */
export const webhookIntegration: IWorkflowIntegration = {
  vendor: WEBHOOK_VENDOR,
  label: 'webhook:label',
  notes:
    "Incoming webhook (HTTP endpoint): start a workflow whenever an external service sends an HTTP request to this project's webhook URL. Needs no credentials.",
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [],
  actions: [],
  triggers: [
    {
      name: WEBHOOK_TRIGGER_NAME,
      label: 'webhook:trigger.incomingWebhook',
      scopeType: { type: 'any' },
      scopeVariableName: WEBHOOK_SCOPE_VARIABLE_NAME,
      signalName: WEBHOOK_SIGNAL_NAME,
      // Documentation only — the real per-trigger-function path is built dynamically by
      // `registerWebhookBackend` (one `uri` per bound trigger-function, not one fixed path per
      // credential the way Telegram's is).
      webhookPath: '/webhooks/webhook/:projectId/:credentialId/:env/:triggerFunctionId',
      notes: [
        'A generic inbound HTTP trigger — fires on any request to the URL generated for a',
        'trigger-function bound to this trigger (visible once created; not a fixed, predictable path).',
        'No vendor-specific payload shape (`scopeType: any`), so read whatever fields the caller sends',
        'off the bound scope variable rather than assuming any particular structure. Use this only for a',
        'system with no dedicated integration in this catalog — if the vendor sending the request already',
        'has its own trigger(s) listed here, prefer those instead of this generic one.',
      ].join(' '),
    },
  ],
  registerBackend: registerWebhookBackend,
};
