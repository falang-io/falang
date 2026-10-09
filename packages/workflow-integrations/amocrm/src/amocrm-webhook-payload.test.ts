import { describe, expect, it } from 'vitest';
import { extractAmoCrmEvents, parseAmoCrmFormBody, readAmoCrmAccount } from './amocrm-webhook-payload.js';
import { AMOCRM_WEBHOOK_TRIGGER_SPECS } from './amocrm-webhook-triggers.js';

const spec = (name: string) => {
  const found = AMOCRM_WEBHOOK_TRIGGER_SPECS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(name);
  return found;
};

const form = (fields: Record<string, string>): string => new URLSearchParams(fields).toString();

describe('parseAmoCrmFormBody', () => {
  it('builds nested objects from PHP bracket keys', () => {
    const parsed = parseAmoCrmFormBody(
      form({ 'leads[status][0][id]': '5', 'leads[status][0][custom_fields][0][values][0][value]': 'x', 'a[]': '1' }),
    );
    expect(structuredClone(parsed)).toEqual({
      leads: { status: { '0': { id: '5', custom_fields: { '0': { values: { '0': { value: 'x' } } } } } } },
      a: { '0': '1' },
    });
  });

  it('drops prototype-polluting segments', () => {
    const parsed = parseAmoCrmFormBody(form({ '__proto__[polluted]': '1', 'leads[constructor][x]': '1', ok: '1' }));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(parsed)).toEqual(['ok']);
  });
});

describe('extractAmoCrmEvents', () => {
  it('turns a lead status change into an event with parsed numbers and the account', () => {
    const payload = parseAmoCrmFormBody(
      form({
        'leads[status][0][id]': '25399013',
        'leads[status][0][name]': 'Deal',
        'leads[status][0][status_id]': '142',
        'leads[status][0][old_status_id]': '7039',
        'leads[status][0][pipeline_id]': '3',
        'leads[status][0][price]': '1500',
        'leads[status][1][id]': '25399014',
        'leads[status][1][status_id]': '143',
        'account[subdomain]': 'acme',
        'account[id]': '29085955',
      }),
    );
    const events = extractAmoCrmEvents(payload, spec('amocrm-on-lead'), 'status');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      entity: 'lead',
      action: 'status',
      id: 25_399_013,
      name: 'Deal',
      statusId: 142,
      oldStatusId: 7039,
      pipelineId: 3,
      price: 1500,
      subdomain: 'acme',
      accountId: 29_085_955,
    });
    expect(events[0].data).toMatchObject({ id: '25399013', status_id: '142' });
    expect(extractAmoCrmEvents(payload, spec('amocrm-on-lead'), 'add')).toEqual([]);
    expect(readAmoCrmAccount(payload)).toEqual({ subdomain: 'acme', id: 29_085_955 });
  });

  it('tells contacts and companies apart when both arrive under `contacts`', () => {
    const payload = parseAmoCrmFormBody(
      form({
        'contacts[add][0][id]': '1',
        'contacts[add][0][type]': 'contact',
        'contacts[add][1][id]': '2',
        'contacts[add][1][type]': 'company',
        'companies[add][0][id]': '3',
      }),
    );
    expect(extractAmoCrmEvents(payload, spec('amocrm-on-contact'), 'add').map((event) => event.id)).toEqual([1]);
    expect(extractAmoCrmEvents(payload, spec('amocrm-on-company'), 'add').map((event) => event.id)).toEqual([3, 2]);
  });

  it('reads tasks under the singular `task` key, with the bound entity', () => {
    const payload = parseAmoCrmFormBody(
      form({ 'task[update][0][id]': '9', 'task[update][0][element_id]': '5', 'task[update][0][element_type]': '2' }),
    );
    expect(extractAmoCrmEvents(payload, spec('amocrm-on-task'), 'update')[0]).toMatchObject({
      entity: 'task',
      action: 'update',
      id: 9,
      elementId: 5,
      elementType: 2,
    });
  });

  it('maps incoming and outgoing chat messages', () => {
    const payload = parseAmoCrmFormBody(
      form({
        'message[add][0][id]': 'uuid-1',
        'message[add][0][chat_id]': 'chat-1',
        'message[add][0][talk_id]': '77',
        'message[add][0][contact_id]': '12',
        'message[add][0][text]': 'Hello',
        'message[add][0][author][name]': 'Ivan',
        'outgoing_message[add][0][text]': 'Hi',
      }),
    );
    const [incoming] = extractAmoCrmEvents(payload, spec('amocrm-on-message'), 'incoming');
    expect(incoming).toMatchObject({
      entity: 'message',
      action: 'incoming',
      text: 'Hello',
      chatId: 'chat-1',
      talkId: 77,
    });
    expect(incoming.contactId).toBe(12);
    expect(incoming.id).toBeUndefined();
    expect(extractAmoCrmEvents(payload, spec('amocrm-on-message'), 'outgoing')[0]).toMatchObject({ text: 'Hi' });
  });

  it('accepts a delete that carries only the id', () => {
    const payload = parseAmoCrmFormBody(form({ 'leads[delete][0][id]': '4', 'contacts[delete][0]': '8' }));
    expect(extractAmoCrmEvents(payload, spec('amocrm-on-lead'), 'delete')[0]).toMatchObject({ id: 4 });
    expect(extractAmoCrmEvents(payload, spec('amocrm-on-contact'), 'delete')[0]).toMatchObject({ id: 8 });
  });
});
