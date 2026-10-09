import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN,
  ACCOUNT_DOMAIN,
  FakeApplicationFailure,
  loadAmoCrmActivities,
  type IRecordedRequest,
} from './test-utils/load-amocrm-activities.js';

// oxlint-disable-next-line no-undefined -- a compiled call site passes a literal `undefined` for every blank optional field.
const BLANK = undefined;

const created = (key: string, id: number) => ({
  status: 200,
  body: { _embedded: { [key]: [{ id, request_id: '0' }] } },
});
const query = (request: IRecordedRequest): URLSearchParams => new URL(request.url).searchParams;
const path = (request: IRecordedRequest): string => new URL(request.url).pathname;

describe('amoCRM activity code (executed against a fake fetch)', () => {
  it('createLead POSTs one lead to the account domain with the bearer token, dropping blank values and merging extra', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => created('leads', 101));
    const extra = {
      custom_fields_values: [{ field_id: 5, values: [{ value: 'x' }] }],
      _embedded: { tags: [{ name: 'web' }] },
    };
    const result = await activities.amocrmCreateLead('cred-1', 'Order #1', 1500, 7, BLANK, BLANK, extra);

    expect(result).toEqual({ id: 101 });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`https://${ACCOUNT_DOMAIN}/api/v4/leads`);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(requests[0].body).toEqual([
      {
        name: 'Order #1',
        price: 1500,
        pipeline_id: 7,
        custom_fields_values: [{ field_id: 5, values: [{ value: 'x' }] }],
        _embedded: { tags: [{ name: 'web' }] },
      },
    ]);
  });

  it('updateLead PATCHes one lead and keeps an empty name unchanged', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => ({ status: 200, body: { id: 5 } }));
    await activities.amocrmUpdateLead('cred-1', 5, '', BLANK, BLANK, 142, BLANK, BLANK);
    expect(requests[0].method).toBe('PATCH');
    expect(path(requests[0])).toBe('/api/v4/leads/5');
    expect(requests[0].body).toEqual({ status_id: 142 });
  });

  it('findLeads serializes filter/order PHP-style and maps HTTP 204 (nothing found) to []', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => ({ status: 204 }));
    const result = await activities.amocrmFindLeads(
      'cred-1',
      '',
      { statuses: [{ pipeline_id: 1, status_id: 2 }], is_deleted: false },
      50,
      'contacts',
    );
    expect(result).toEqual([]);
    const params = query(requests[0]);
    expect(params.get('filter[statuses][0][pipeline_id]')).toBe('1');
    expect(params.get('filter[statuses][0][status_id]')).toBe('2');
    expect(params.get('filter[is_deleted]')).toBe('0');
    expect(params.get('limit')).toBe('50');
    expect(params.get('with')).toBe('contacts');
    expect(params.has('query')).toBe(false);
  });

  it('findContacts returns _embedded.contacts', async () => {
    const contacts = [{ id: 1, name: 'Ivan' }];
    const { activities, requests } = loadAmoCrmActivities(() => ({ status: 200, body: { _embedded: { contacts } } }));
    expect(await activities.amocrmFindContacts('cred-1', ' +7 900 ', {}, BLANK, '')).toEqual(contacts);
    expect(query(requests[0]).get('query')).toBe('+7 900');
    expect(query(requests[0]).has('with')).toBe(false);
  });

  it('getLead returns BLANK for HTTP 204', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => ({ status: 204 }));
    expect(await activities.amocrmGetLead('cred-1', 9, 'contacts')).toBeUndefined();
    expect(path(requests[0])).toBe('/api/v4/leads/9');
    expect(query(requests[0]).get('with')).toBe('contacts');
  });

  it('createLeadComplex embeds the contact (PHONE/EMAIL multi-fields) and company and returns the created ids', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => ({
      status: 200,
      body: [{ id: 11, contact_id: 22, company_id: null, request_id: ['0'], merged: false }],
    }));
    const result = await activities.amocrmCreateLeadComplex(
      'cred-1',
      'Site request',
      BLANK,
      BLANK,
      BLANK,
      BLANK,
      'Ivan',
      '+79001234567',
      '',
      '',
      BLANK,
    );
    expect(result).toEqual({ id: 11, contactId: 22, companyId: BLANK, merged: false });
    expect(path(requests[0])).toBe('/api/v4/leads/complex');
    expect(requests[0].body).toEqual([
      {
        name: 'Site request',
        _embedded: {
          contacts: [
            {
              name: 'Ivan',
              custom_fields_values: [{ field_code: 'PHONE', values: [{ value: '+79001234567', enum_code: 'WORK' }] }],
            },
          ],
        },
      },
    ]);
  });

  it('createContact sends phone and e-mail as amoCRM multi-fields', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => created('contacts', 3));
    expect(await activities.amocrmCreateContact('cred-1', 'Anna', '', 'a@b.c', 4, BLANK)).toEqual({ id: 3 });
    expect(requests[0].body).toEqual([
      {
        name: 'Anna',
        responsible_user_id: 4,
        custom_fields_values: [{ field_code: 'EMAIL', values: [{ value: 'a@b.c', enum_code: 'WORK' }] }],
      },
    ]);
  });

  it('createTask omits the entity binding when no entity id is given', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => created('tasks', 8));
    await activities.amocrmCreateTask('cred-1', 'leads', BLANK, 'Call back', 1_800_000_000, BLANK, BLANK);
    expect(requests[0].body).toEqual([{ text: 'Call back', complete_till: 1_800_000_000 }]);
  });

  it('completeTask PATCHes is_completed with the result text', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => ({ status: 200, body: { id: 8 } }));
    await activities.amocrmCompleteTask('cred-1', 8, 'Done');
    expect(path(requests[0])).toBe('/api/v4/tasks/8');
    expect(requests[0].body).toEqual({ is_completed: true, result: { text: 'Done' } });
  });

  it('addNote posts a common note to the entity type notes endpoint', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => created('notes', 77));
    expect(await activities.amocrmAddNote('cred-1', 'contacts', 3, 'Hello')).toEqual({ id: 77 });
    expect(path(requests[0])).toBe('/api/v4/contacts/notes');
    expect(requests[0].body).toEqual([{ entity_id: 3, note_type: 'common', params: { text: 'Hello' } }]);
  });

  it('linkEntities posts to /{entity_type}/link', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => ({ status: 200, body: {} }));
    await activities.amocrmLinkEntities('cred-1', 'leads', 1, 'contacts', 2);
    expect(path(requests[0])).toBe('/api/v4/leads/link');
    expect(requests[0].body).toEqual([{ entity_id: 1, to_entity_id: 2, to_entity_type: 'contacts' }]);
  });

  it('a 4xx answer is a non-retryable failure typed by status; 429 and 5xx stay retryable', async () => {
    const badRequest = loadAmoCrmActivities(() => ({ status: 400, body: { title: 'Bad Request' } }));
    const failure = await badRequest.activities.amocrmGetLead('cred-1', 1, '').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FakeApplicationFailure);
    expect(failure).toMatchObject({ nonRetryable: true, type: 'AMOCRM_HTTP_400' });

    const tooMany = loadAmoCrmActivities(() => ({ status: 429, body: {} }));
    const retryable = await tooMany.activities.amocrmGetLead('cred-1', 1, '').catch((error: unknown) => error);
    expect(retryable).not.toBeInstanceOf(FakeApplicationFailure);
    expect(String(retryable)).toContain('429');
  });

  it('rejects an invalid id or entity type before calling amoCRM', async () => {
    const { activities, requests } = loadAmoCrmActivities(() => ({ status: 200, body: {} }));
    await expect(activities.amocrmGetLead('cred-1', 0, '')).rejects.toMatchObject({ nonRetryable: true });
    await expect(activities.amocrmAddNote('cred-1', '../users', 1, 'x')).rejects.toMatchObject({ nonRetryable: true });
    expect(requests).toHaveLength(0);
  });

  describe('amocrmCallMethod (generic catalog method)', () => {
    it('substitutes path params, sends query params PHP-style and the body as JSON', async () => {
      const { activities, requests } = loadAmoCrmActivities(() => ({ status: 200, body: { id: 5 } }));
      await activities.amocrmCallMethod('cred-1', 'updateLead', { id: 5, body: { status_id: 142 } });
      expect(requests[0].method).toBe('PATCH');
      expect(path(requests[0])).toBe('/api/v4/leads/5');
      expect(requests[0].body).toEqual({ status_id: 142 });

      await activities.amocrmCallMethod('cred-1', 'getEntityNotes', {
        entity_type: 'contacts',
        entity_id: 3,
        filter: { note_type: ['common'] },
        limit: 10,
      });
      expect(requests[1].method).toBe('GET');
      expect(path(requests[1])).toBe('/api/v4/contacts/3/notes');
      expect(query(requests[1]).get('filter[note_type][0]')).toBe('common');
      expect(query(requests[1]).get('limit')).toBe('10');
      expect(requests[1].body).toBeNull();
    });

    it('returns the raw answer, null for HTTP 204', async () => {
      const page = { _page: 1, _embedded: { leads: [{ id: 1 }] } };
      const found = loadAmoCrmActivities(() => ({ status: 200, body: page }));
      expect(await found.activities.amocrmCallMethod('cred-1', 'getLeads', {})).toEqual(page);
      const empty = loadAmoCrmActivities(() => ({ status: 204 }));
      expect(await empty.activities.amocrmCallMethod('cred-1', 'getLeads', {})).toBeNull();
    });

    it('supports DELETE with a body (decline unsorted)', async () => {
      const { activities, requests } = loadAmoCrmActivities(() => ({ status: 200, body: {} }));
      await activities.amocrmCallMethod('cred-1', 'declineUnsorted', { uid: 'abc-123', body: { user_id: 1 } });
      expect(requests[0].method).toBe('DELETE');
      expect(path(requests[0])).toBe('/api/v4/leads/unsorted/abc-123/decline');
      expect(requests[0].body).toEqual({ user_id: 1 });
    });

    it('rejects an unknown method and a missing or unsafe path param without calling amoCRM', async () => {
      const { activities, requests } = loadAmoCrmActivities(() => ({ status: 200, body: {} }));
      await expect(activities.amocrmCallMethod('cred-1', 'noSuchMethod', {})).rejects.toMatchObject({
        nonRetryable: true,
      });
      await expect(activities.amocrmCallMethod('cred-1', 'updateLead', { body: {} })).rejects.toMatchObject({
        nonRetryable: true,
      });
      await expect(
        activities.amocrmCallMethod('cred-1', 'getEntityNotes', { entity_type: '../users', entity_id: 1 }),
      ).rejects.toMatchObject({ nonRetryable: true });
      expect(requests).toHaveLength(0);
    });
  });
});
