import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readRawBody, type TRawBodySource } from './ai-provider-raw-body.js';

const request = (headers: Record<string, string> = {}): TRawBodySource => Object.assign(new PassThrough(), { headers });

describe('readRawBody (ADR 0081 transcription relay)', () => {
  it('collects an unparsed stream', async () => {
    const req = request() as TRawBodySource & PassThrough;
    const reading = readRawBody(req, 10);
    req.end(Buffer.from('abcdef'));
    const body = await reading;
    expect(body.toString()).toBe('abcdef');
  });

  it('413 request_too_large past the limit, after draining the rest', async () => {
    const req = request() as TRawBodySource & PassThrough;
    const reading = readRawBody(req, 4);
    req.write(Buffer.from('abc'));
    req.end(Buffer.from('defgh'));
    await expect(reading).rejects.toMatchObject({ status: 413, response: { code: 'request_too_large' } });
  });

  it('413 at once for a declared Content-Length over the limit; an already parsed rawBody is reused', async () => {
    await expect(readRawBody(request({ 'content-length': '11' }), 10)).rejects.toMatchObject({ status: 413 });
    const parsed = Object.assign(request(), { rawBody: Buffer.from('xyz') });
    const body = await readRawBody(parsed, 10);
    expect(body.toString()).toBe('xyz');
  });
});
