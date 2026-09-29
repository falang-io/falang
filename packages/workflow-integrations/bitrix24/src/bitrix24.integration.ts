import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { registerBitrix24Backend } from './bitrix24-backend.js';
import {
  BITRIX24_SCOPE_VARIABLE_NAME,
  BITRIX24_SIGNAL_NAME,
  BITRIX24_TRIGGER_NAME,
  BITRIX24_VENDOR,
} from './constants.js';

export * from './constants.js';

/**
 * Bitrix24 — CRM/portal, P0 in ADR 0017 (private). MVP scope:
 * **trigger only**, receiving Bitrix24's *outgoing* webhook (portal admin: Developer resources >
 * Other > Outgoing webhook) — see `bitrix24-backend.ts` for the verified wire format
 * (`application/x-www-form-urlencoded`, bracket-notation nesting, `auth[application_token]`
 * shared-secret verification).
 *
 * Deliberately no native action: Bitrix24's *incoming* webhook (used to call its REST API,
 * `https://{portal}.bitrix24.ru/rest/{user_id}/{webhook_code}/{method}.json`) is just a static
 * URL-embedded secret, which the generic `http-request` action already covers — store that URL as a
 * `secret` credential on an `http-request` node, same "generic node covers it" reasoning the ADR's P0
 * table already gives for this vendor's action side, and the same one its P1 table gives for
 * Wildberries/Ozon/МойСклад.
 */
export const bitrix24Integration: IWorkflowIntegration = {
  vendor: BITRIX24_VENDOR,
  label: 'Bitrix24',
  notes:
    'Bitrix24 — CRM and business portal: start a workflow on Bitrix24 events (outgoing webhook), e.g. a new or updated deal, lead or contact.',
  credentialFields: [
    {
      name: 'application_token',
      label: 'Outgoing webhook token (application_token)',
      kind: 'secret',
    },
  ],
  triggers: [
    {
      name: BITRIX24_TRIGGER_NAME,
      label: 'Bitrix24: Event (outgoing webhook)',
      // Payload shape varies per Bitrix24 event (ONCRMLEADADD vs. ONCRMDEALUPDATE vs. …) and Bitrix24
      // itself only sends field IDs, not a fixed struct — same "not worth a struct yet" call
      // `@falang/workflow-integrations-webhook`'s own webhook-trigger already made for the same reason.
      scopeType: { type: 'any' },
      scopeVariableName: BITRIX24_SCOPE_VARIABLE_NAME,
      signalName: BITRIX24_SIGNAL_NAME,
      // Documentation only — the real per-trigger-function path is built dynamically by
      // registerBitrix24Backend (one `uri` per bound trigger-function), same as
      // @falang/workflow-integrations-webhook's webhook-trigger.
      webhookPath: '/webhooks/bitrix24/:credentialId/:env/:triggerFunctionId',
      notes: [
        'Fires on a Bitrix24 portal event (e.g. a CRM lead/deal created or updated), delivered via',
        "Bitrix24's own *outgoing* webhook mechanism the portal admin configures — this is the only way",
        'to react to a Bitrix24 event; there is no separate trigger per event type. `scopeType: any`, and',
        'the payload shape varies by event (`ONCRMLEADADD` vs. `ONCRMDEALUPDATE` vs. …, only field IDs,',
        "not a fixed struct) — branch on the bound scope variable's own fields rather than assuming one",
        'fixed shape.',
      ].join(' '),
    },
  ],
  actions: [],
  registerBackend: registerBitrix24Backend,
};
