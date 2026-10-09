import type { TVariableInfo } from '@falang/typescript-dto';
import type { IIntegrationStructType, ITriggerDescriptor } from '@falang/workflow-integrations-common';

export const AMOCRM_WEBHOOK_SIGNAL_NAME = 'amocrm-webhook';
export const AMOCRM_WEBHOOK_EVENT_STRUCT_ID = 'amocrm/WebhookEvent';
/** The context field every amoCRM trigger declares — which event of its entity starts the workflow. */
export const AMOCRM_TRIGGER_EVENT_FIELD = 'event';
const SCOPE_VARIABLE_NAME = 'event';

/** One selectable event of a trigger: the amoCRM webhook `settings` value to subscribe to, and where its items arrive in the payload. */
export interface IAmoCrmWebhookEventSpec {
  /** Stored in `triggerConfig.event`. */
  readonly value: string;
  /** The `settings` value of `POST /api/v4/webhooks`. */
  readonly setting: string;
  /** Top-level payload keys the items may arrive under (amoCRM isn't consistent between singular and plural). */
  readonly payloadKeys: readonly string[];
  /** The action key under the payload key (`leads[status][0]…` → `status`). */
  readonly action: string;
  /** Items under a shared key (`contacts`) told apart by their `type` field: `company` vs anything else. */
  readonly itemType?: 'company' | 'contact';
}

export interface IAmoCrmWebhookTriggerSpec {
  readonly name: string;
  /** `event.entity` in the workflow, e.g. `lead`. */
  readonly entity: string;
  readonly events: readonly IAmoCrmWebhookEventSpec[];
  readonly notes: string;
}

const crud = (
  entity: string,
  plural: string,
  actions: readonly string[],
  extra: Partial<IAmoCrmWebhookEventSpec> = {},
): IAmoCrmWebhookEventSpec[] =>
  actions.map((action) => ({ value: action, setting: `${action}_${entity}`, payloadKeys: [plural], action, ...extra }));

/**
 * Every webhook event amoCRM's `POST /api/v4/webhooks` accepts (except the WhatsApp template review), grouped into one
 * trigger per entity — the user picks the event when creating the trigger.
 */
export const AMOCRM_WEBHOOK_TRIGGER_SPECS: readonly IAmoCrmWebhookTriggerSpec[] = [
  {
    name: 'amocrm-on-lead',
    entity: 'lead',
    events: crud('lead', 'leads', ['add', 'update', 'status', 'responsible', 'delete', 'restore', 'note']),
    notes:
      'Starts a workflow on an amoCRM lead (deal) event chosen at creation: created, updated, moved to another ' +
      'pipeline stage (status — event.statusId/oldStatusId/pipelineId), responsible user changed, deleted, restored, ' +
      'or a note added. One run per event; event.id is the lead id — read the full lead with amocrm-get-lead.',
  },
  {
    name: 'amocrm-on-contact',
    entity: 'contact',
    events: crud('contact', 'contacts', ['add', 'update', 'responsible', 'delete', 'restore', 'note'], {
      itemType: 'contact',
    }),
    notes:
      'Starts a workflow on an amoCRM contact event chosen at creation: created, updated, responsible user changed, ' +
      'deleted, restored, or a note added. event.id is the contact id; raw fields (custom_fields) are in event.data.',
  },
  {
    name: 'amocrm-on-company',
    entity: 'company',
    events: crud('company', 'companies', ['add', 'update', 'responsible', 'delete', 'restore', 'note'], {
      payloadKeys: ['companies', 'contacts'],
      itemType: 'company',
    }),
    notes:
      'Starts a workflow on an amoCRM company event chosen at creation: created, updated, responsible user changed, ' +
      'deleted, restored, or a note added. event.id is the company id.',
  },
  {
    name: 'amocrm-on-task',
    entity: 'task',
    events: crud('task', 'tasks', ['add', 'update', 'delete', 'responsible'], { payloadKeys: ['task', 'tasks'] }),
    notes:
      'Starts a workflow on an amoCRM task event chosen at creation: created, updated (incl. completed — ' +
      'event.data.status is "1"), deleted, responsible user changed. event.elementId/elementType is the entity the ' +
      'task belongs to.',
  },
  {
    name: 'amocrm-on-customer',
    entity: 'customer',
    events: crud('customer', 'customers', ['add', 'update', 'delete', 'responsible', 'note']),
    notes:
      'Starts a workflow on an amoCRM customer (periodic purchases) event chosen at creation: created, updated, ' +
      'deleted, responsible user changed, or a note added.',
  },
  {
    name: 'amocrm-on-talk',
    entity: 'talk',
    events: crud('talk', 'talks', ['add', 'update'], { payloadKeys: ['talks', 'talk'] }),
    notes:
      'Starts a workflow when an amoCRM chat conversation (talk) is created or updated. event.talkId, ' +
      'event.chatId and event.contactId identify it.',
  },
  {
    name: 'amocrm-on-message',
    entity: 'message',
    events: [
      { value: 'incoming', setting: 'add_message', payloadKeys: ['message'], action: 'add' },
      { value: 'outgoing', setting: 'add_outgoing_message', payloadKeys: ['outgoing_message'], action: 'add' },
    ],
    notes:
      'Starts a workflow on a chat message in amoCRM (a messenger connected to the account): an incoming message from ' +
      'a client, or an outgoing one sent from amoCRM. event.text is the message text, event.chatId/talkId/contactId ' +
      'identify the conversation, event.data.author the sender. This is how to react to a client writing to the ' +
      "account's messengers through amoCRM.",
  },
];

const int64: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int64' }, optional: true };
const optionalString: TVariableInfo = { type: 'string', optional: true };

/** What every amoCRM trigger binds to `event`. Numbers are parsed from amoCRM's form-encoded strings; `data` is the raw item as amoCRM sent it. */
export const AMOCRM_WEBHOOK_EVENT_STRUCT: IIntegrationStructType = {
  id: AMOCRM_WEBHOOK_EVENT_STRUCT_ID,
  name: 'AmoCrmWebhookEvent',
  properties: {
    entity: { type: 'string' },
    action: { type: 'string' },
    id: int64,
    subdomain: { type: 'string' },
    accountId: int64,
    name: optionalString,
    statusId: int64,
    oldStatusId: int64,
    pipelineId: int64,
    oldPipelineId: int64,
    responsibleUserId: int64,
    oldResponsibleUserId: int64,
    price: { type: 'number', numberType: { type: 'any' }, optional: true },
    elementId: int64,
    elementType: int64,
    text: optionalString,
    chatId: optionalString,
    talkId: int64,
    contactId: int64,
    createdUserId: int64,
    modifiedUserId: int64,
    data: { type: 'any' },
  },
};

const triggerDescriptor = (spec: IAmoCrmWebhookTriggerSpec): ITriggerDescriptor => ({
  name: spec.name,
  label: `amocrm:trigger.${spec.entity}`,
  scopeType: { type: 'struct', id: AMOCRM_WEBHOOK_EVENT_STRUCT_ID },
  scopeVariableName: SCOPE_VARIABLE_NAME,
  signalName: AMOCRM_WEBHOOK_SIGNAL_NAME,
  // Documentation only — one route per credential/env, see `registerAmoCrmBackend`.
  webhookPath: '/webhooks/amocrm/:projectId/:credentialId/:env/:key',
  notes: spec.notes,
  contextFields: [
    {
      name: AMOCRM_TRIGGER_EVENT_FIELD,
      label: 'amocrm:field.event',
      kind: 'select',
      options: spec.events.map((event) => ({ value: event.value, label: `amocrm:event.${event.value}` })),
      defaultValue: spec.events[0].value,
    },
  ],
  journalMessage: 'amoCRM ${event.entity} ${event.action} ${event.id ?? ""}',
});

export const AMOCRM_TRIGGERS: readonly ITriggerDescriptor[] = AMOCRM_WEBHOOK_TRIGGER_SPECS.map((spec) =>
  triggerDescriptor(spec),
);
