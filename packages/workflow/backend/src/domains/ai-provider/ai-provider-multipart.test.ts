import { describe, expect, it } from 'vitest';
import { multipartBoundary, readMultipartTextFields } from './ai-provider-multipart.js';

const encode = async (form: FormData): Promise<{ body: Buffer; contentType: string }> => {
  const request = new Request('http://x/', { method: 'POST', body: form });
  return {
    body: Buffer.from(await request.arrayBuffer()),
    contentType: request.headers.get('content-type') ?? '',
  };
};

describe('multipart text fields of the transcription relay (ADR 0081)', () => {
  it('reads the boundary of multipart/form-data only', () => {
    expect(multipartBoundary('multipart/form-data; boundary=abc')).toBe('abc');
    expect(multipartBoundary('Multipart/Form-Data; charset=utf-8; boundary="a b"')).toBe('a b');
    expect(multipartBoundary('application/json')).toBeNull();
    expect(multipartBoundary('multipart/form-data')).toBeNull();
    expect(multipartBoundary('')).toBeNull();
  });

  it('extracts plain fields around a binary file part, as FormData encodes them', async () => {
    const audio = new Uint8Array(4096).map((_, index) => index % 256);
    const form = new FormData();
    form.append('file', new Blob([audio], { type: 'audio/mpeg' }), 'voice.mp3');
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('response_format', 'json');
    form.append('language', 'ru');
    const { body, contentType } = await encode(form);
    const boundary = multipartBoundary(contentType);
    if (!boundary) throw new Error('boundary');
    expect(readMultipartTextFields(body, boundary, ['model', 'stream', 'language'])).toEqual({
      model: 'gpt-4o-mini-transcribe',
      language: 'ru',
    });
  });

  it('never reads a file part as a field, and tolerates a malformed body', async () => {
    const form = new FormData();
    form.append('model', new Blob(['whisper-1']), 'model.txt');
    form.append('model', 'whisper-1');
    const { body, contentType } = await encode(form);
    expect(readMultipartTextFields(body, multipartBoundary(contentType) ?? '', ['model'])).toEqual({
      model: 'whisper-1',
    });
    expect(readMultipartTextFields(Buffer.from('garbage'), 'b', ['model'])).toEqual({});
    expect(readMultipartTextFields(Buffer.from('--b\r\nno headers end'), 'b', ['model'])).toEqual({});
  });

  it('keeps a UTF-8 value intact', () => {
    const body = Buffer.from(
      '--b\r\nContent-Disposition: form-data; name="model"\r\n\r\nмодель-1\r\n--b--\r\n',
      'utf8',
    );
    expect(readMultipartTextFields(body, 'b', ['model'])).toEqual({ model: 'модель-1' });
  });
});
