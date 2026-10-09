import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { AMOCRM_ACTION_STRUCT_TYPES, AMOCRM_DEDICATED_ACTIONS } from './amocrm-actions.js';
import { AMOCRM_METHOD_STRUCT_TYPES, amocrmCallMethodAction } from './amocrm-call-method.js';
import { AMOCRM_LOCALES } from './amocrm-locales.js';
import { amocrmOAuth2Config } from './amocrm-oauth2.js';
import { AMOCRM_SHARED_ACTIVITY_CODE } from './amocrm-shared-activity-code.js';
import { AMOCRM_STRUCT_TYPES } from './amocrm-types.js';
import { registerAmoCrmBackend } from './amocrm-backend.js';
import { AMOCRM_TRIGGERS, AMOCRM_WEBHOOK_EVENT_STRUCT } from './amocrm-webhook-triggers.js';
import { AMOCRM_VENDOR } from './constants.js';

export * from './constants.js';

/**
 * amoCRM — CRM/portal, P0 in ADR 0017 (private). OAuth2 through the platform's own amoCRM
 * integration (`amocrm-oauth2.ts`); every call goes through the shared `amocrmRequest`
 * (`amocrm-shared-activity-code.ts`).
 *
 * The API surface follows the official PHP client `amocrm/amocrm-api-php` and is exposed in two
 * layers: dedicated node kinds for the operations a workflow needs most often (`amocrm-actions.ts` —
 * leads, contacts, companies, tasks, notes, links, the "lead + contact" complex creation), and one
 * generic `amocrm-call-method` node over a hand-written catalog of every API v4 endpoint the PHP
 * client implements (`amocrm-methods.ts`/`amocrm-call-method.ts`), with `data` typed per method.
 *
 * Triggers (`amocrm-webhook-triggers.ts`/`amocrm-backend.ts`): one per entity (lead, contact, company, task,
 * customer, talk, chat message) with the event picked at creation, fed by an amoCRM webhook the backend subscribes
 * through the API.
 */
export const amocrmIntegration: IWorkflowIntegration = {
  vendor: AMOCRM_VENDOR,
  label: 'amoCRM',
  notes:
    'amoCRM (Kommo) — CRM / sales pipeline: start a workflow on amoCRM events (new or updated lead, lead moved to ' +
    'another stage, contact/company/task/customer events, incoming chat messages); create, find and update leads (deals), contacts and companies, ' +
    'move leads between pipeline stages, create and complete tasks, add notes, link entities, and call any other ' +
    'amoCRM API v4 method (pipelines, custom fields, tags, catalogs, customers, unsorted, users, webhooks, …).',
  oauth2: amocrmOAuth2Config,
  credentialFields: [
    // OAuth2 tokens live in the dev slot only (the callback writes them there); `secretProdOptional` lets a prod
    // target fall back to them — without it the prod ingress (webhook triggers) would never count as configured.
    { name: 'access_token', label: 'Access token', kind: 'secret', hidden: true, secretProdOptional: true },
    { name: 'refresh_token', label: 'Refresh token', kind: 'secret', hidden: true, secretProdOptional: true },
    { name: 'expires_at', label: 'Expires at', kind: 'text', hidden: true },
    { name: 'account_domain', label: 'Account domain', kind: 'text', hidden: true },
  ],
  triggers: AMOCRM_TRIGGERS,
  types: [
    AMOCRM_WEBHOOK_EVENT_STRUCT,
    ...AMOCRM_STRUCT_TYPES,
    ...AMOCRM_ACTION_STRUCT_TYPES,
    ...AMOCRM_METHOD_STRUCT_TYPES,
  ],
  actions: [...AMOCRM_DEDICATED_ACTIONS, amocrmCallMethodAction],
  sharedActivityCode: AMOCRM_SHARED_ACTIVITY_CODE,
  locales: AMOCRM_LOCALES,
  registerBackend: registerAmoCrmBackend,
};
