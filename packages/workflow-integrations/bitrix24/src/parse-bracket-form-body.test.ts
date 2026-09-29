import { describe, expect, it } from 'vitest';
import { parseBracketFormBody } from './parse-bracket-form-body.js';

describe('parseBracketFormBody', () => {
  it('parses plain (unbracketed) keys as top-level string values', () => {
    expect(parseBracketFormBody('event=ONCRMLEADADD&ts=1234567890')).toEqual({
      event: 'ONCRMLEADADD',
      ts: '1234567890',
    });
  });

  it('rebuilds nested bracket-notation keys into a nested object', () => {
    expect(parseBracketFormBody('data%5BFIELDS%5D%5BID%5D=123')).toEqual({
      data: { FIELDS: { ID: '123' } },
    });
  });

  it('parses a real Bitrix24 outgoing-webhook body end to end', () => {
    const body = [
      'event=ONCRMLEADADD',
      'data%5BFIELDS%5D%5BID%5D=123',
      'ts=1727000000',
      'auth%5Bdomain%5D=example.bitrix24.ru',
      'auth%5Bmember_id%5D=abc123',
      'auth%5Bapplication_token%5D=secret-token',
    ].join('&');

    expect(parseBracketFormBody(body)).toEqual({
      event: 'ONCRMLEADADD',
      data: { FIELDS: { ID: '123' } },
      ts: '1727000000',
      auth: {
        domain: 'example.bitrix24.ru',
        member_id: 'abc123',
        application_token: 'secret-token',
      },
    });
  });

  it('decodes URL-encoded values (e.g. Cyrillic field content)', () => {
    expect(
      parseBracketFormBody('data%5BFIELDS%5D%5BTITLE%5D=%D0%9D%D0%BE%D0%B2%D1%8B%D0%B9%20%D0%BB%D0%B8%D0%B4'),
    ).toEqual({
      data: { FIELDS: { TITLE: 'Новый лид' } },
    });
  });

  it('returns an empty object for an empty body', () => {
    expect(parseBracketFormBody('')).toEqual({});
  });
});
