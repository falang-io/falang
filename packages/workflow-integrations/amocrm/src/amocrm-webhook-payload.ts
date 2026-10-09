import type { IAmoCrmWebhookEventSpec, IAmoCrmWebhookTriggerSpec } from './amocrm-webhook-triggers.js';

type TNested = { [key: string]: TNested } | string;

const MAX_DEPTH = 12;

/**
 * amoCRM posts webhooks as `application/x-www-form-urlencoded` with PHP bracket nesting
 * (`leads[status][0][id]=1&account[subdomain]=acme`). Builds the nested object; numeric segments stay object keys
 * (`asList` turns such an object into an array). Keys nested deeper than `MAX_DEPTH`, and `__proto__`/`constructor`/
 * `prototype` segments, are dropped.
 */
export const parseAmoCrmFormBody = (body: string): Record<string, TNested> => {
  const root: Record<string, TNested> = Object.create(null) as Record<string, TNested>;
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const match = /^([^[\]]+)((?:\[[^[\]]*\])*)$/.exec(rawKey);
    if (!match) continue;
    const segments = [match[1], ...[...match[2].matchAll(/\[([^[\]]*)\]/g)].map((part) => part[1])];
    if (segments.length > MAX_DEPTH) continue;
    if (segments.some((segment) => segment === '__proto__' || segment === 'constructor' || segment === 'prototype')) {
      continue;
    }
    let node: Record<string, TNested> = root;
    for (const [index, rawSegment] of segments.entries()) {
      const isLast = index === segments.length - 1;
      const segment = rawSegment === '' ? String(Object.keys(node).length) : rawSegment;
      if (isLast) {
        node[segment] = value;
        break;
      }
      const next = node[segment];
      if (typeof next === 'object') {
        node = next;
      } else {
        const created: Record<string, TNested> = Object.create(null) as Record<string, TNested>;
        node[segment] = created;
        node = created;
      }
    }
  }
  return root;
};

/** A list from an array-like object (`{ "0": …, "1": … }`), an array, or a single value. */
const asList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
      return keys.toSorted((a, b) => Number(a) - Number(b)).map((key) => (value as Record<string, unknown>)[key]);
    }
    return [value];
  }
  // A bare id (e.g. a delete carrying only the id); anything else (absent) is no item.
  return typeof value === 'string' || typeof value === 'number' ? [value] : [];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Plain-JSON copy (form parsing builds prototype-less objects). */
const toPlain = (value: unknown): unknown => {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => toPlain(item));
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toPlain(child)]));
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toText = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export interface IAmoCrmAccountInfo {
  readonly subdomain: string | null;
  readonly id: number | null;
}

/** `account[subdomain]`/`account[id]` of a parsed payload, when amoCRM sent them. */
export const readAmoCrmAccount = (payload: Record<string, unknown>): IAmoCrmAccountInfo => {
  const account = asRecord(payload.account);
  return { subdomain: toText(account?.subdomain), id: toNumber(account?.id) };
};

/** The workflow payload for one item — see `AMOCRM_WEBHOOK_EVENT_STRUCT`. */
export interface IAmoCrmWebhookEvent {
  readonly entity: string;
  readonly action: string;
  readonly subdomain: string;
  readonly data: unknown;
  readonly [key: string]: unknown;
}

const NUMERIC_FIELDS: Readonly<Record<string, string>> = {
  statusId: 'status_id',
  oldStatusId: 'old_status_id',
  pipelineId: 'pipeline_id',
  oldPipelineId: 'old_pipeline_id',
  responsibleUserId: 'responsible_user_id',
  oldResponsibleUserId: 'old_responsible_user_id',
  price: 'price',
  elementId: 'element_id',
  elementType: 'element_type',
  talkId: 'talk_id',
  contactId: 'contact_id',
  createdUserId: 'created_user_id',
  modifiedUserId: 'modified_user_id',
};

const buildEvent = (
  spec: IAmoCrmWebhookTriggerSpec,
  event: IAmoCrmWebhookEventSpec,
  item: unknown,
  account: IAmoCrmAccountInfo,
): IAmoCrmWebhookEvent => {
  const record = asRecord(item);
  // A delete may carry just the id; a note event nests the note (`leads[note][0][note][element_id]`).
  const note = asRecord(record?.note);
  const id = record ? toNumber(record.id ?? note?.element_id) : toNumber(item);
  const result: Record<string, unknown> = {
    entity: spec.entity,
    action: event.value,
    subdomain: account.subdomain ?? '',
    data: toPlain(item),
  };
  if (id !== null) result.id = id;
  if (account.id !== null) result.accountId = account.id;
  const source = { ...note, ...record };
  for (const [property, key] of Object.entries(NUMERIC_FIELDS)) {
    const value = toNumber(source[key]);
    if (value !== null) result[property] = value;
  }
  const name = toText(source.name);
  if (name !== null) result.name = name;
  const text = toText(source.text);
  if (text !== null) result.text = text;
  const chatId = toText(source.chat_id);
  if (chatId !== null) result.chatId = chatId;
  return result as IAmoCrmWebhookEvent;
};

const matchesItemType = (event: IAmoCrmWebhookEventSpec, payloadKey: string, item: unknown): boolean => {
  if (!event.itemType || payloadKey !== 'contacts') return true;
  const type = asRecord(item)?.type;
  return event.itemType === 'company' ? type === 'company' : type !== 'company';
};

/** Every item of `payload` that the `(spec, eventValue)` binding listens to, as workflow events. */
export const extractAmoCrmEvents = (
  payload: Record<string, unknown>,
  spec: IAmoCrmWebhookTriggerSpec,
  eventValue: string,
): IAmoCrmWebhookEvent[] => {
  const event = spec.events.find((candidate) => candidate.value === eventValue);
  if (!event) return [];
  const account = readAmoCrmAccount(payload);
  const events: IAmoCrmWebhookEvent[] = [];
  for (const payloadKey of event.payloadKeys) {
    const byAction = asRecord(payload[payloadKey]);
    for (const item of asList(byAction?.[event.action])) {
      if (matchesItemType(event, payloadKey, item)) events.push(buildEvent(spec, event, item, account));
    }
  }
  return events;
};
