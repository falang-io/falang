import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { registerYookassaBackend } from './yookassa-backend.js';
import {
  YOOKASSA_SCOPE_VARIABLE_NAME,
  YOOKASSA_SIGNAL_NAME,
  YOOKASSA_TRIGGER_NAME,
  YOOKASSA_VENDOR,
} from './constants.js';

export * from './constants.js';

/**
 * ЮKassa / СБП — payments, P0 in ADR 0017 (private). MVP
 * scope: **trigger only**, receiving ЮKassa's HTTP notification (merchant cabinet: "Уведомления" >
 * webhook URL) — see `yookassa-backend.ts` for the verified wire format (`{ type: 'notification',
 * event, object }` JSON) and, more importantly, its verification strategy: ЮKassa's notifications
 * carry no signature at all, so this re-confirms every notified resource against ЮKassa's own API
 * with Basic-auth merchant credentials rather than trusting the notification body — see that file's
 * doc comment.
 *
 * Deliberately no native action: creating a payment is a plain Basic-auth JSON POST (plus a
 * required, but not secret, per-request `Idempotence-Key` header) — the generic `http-request` action
 * already covers it, same "generic node covers the action side" reasoning the ADR's P0 table already
 * gives for Bitrix24.
 */
export const yookassaIntegration: IWorkflowIntegration = {
  vendor: YOOKASSA_VENDOR,
  label: 'ЮKassa',
  notes:
    'YooKassa (ЮKassa) — online payments / acquiring: start a workflow on payment notifications (payment succeeded, canceled, refund).',
  credentialFields: [
    { name: 'shop_id', label: 'Shop ID', kind: 'text' },
    { name: 'secret_key', label: 'Secret key', kind: 'secret' },
  ],
  triggers: [
    {
      name: YOOKASSA_TRIGGER_NAME,
      label: 'ЮKassa: Событие (платёж/возврат)',
      // Confirmed object shape (a payment or a refund resource) varies by `event` — not worth a
      // struct yet, same "not worth a struct yet" call `webhook-trigger`/`bitrix24-trigger` already
      // made for the same reason.
      scopeType: { type: 'any' },
      scopeVariableName: YOOKASSA_SCOPE_VARIABLE_NAME,
      signalName: YOOKASSA_SIGNAL_NAME,
      // Documentation only — the real per-trigger-function path is built dynamically by
      // registerYookassaBackend (one `uri` per bound trigger-function), same as
      // @falang/workflow-integrations-webhook's webhook-trigger.
      webhookPath: '/webhooks/yookassa/:credentialId/:env/:triggerFunctionId',
      notes: [
        'Fires on a ЮKassa payment/refund event (e.g. payment.succeeded, refund.succeeded) — this is the',
        'only way to react to a ЮKassa payment event; there is no separate trigger per event type.',
        '`scopeType: any`, and the object shape (a payment vs. a refund resource) varies by event — branch',
        "on the bound scope variable's own fields (e.g. its `event`/`object` shape) rather than assuming",
        "one fixed shape. The notification itself is already re-verified against ЮKassa's own API before",
        'this trigger fires (see `yookassa-backend.ts`), so its payload can be trusted as genuine.',
      ].join(' '),
    },
  ],
  actions: [],
  registerBackend: registerYookassaBackend,
};
