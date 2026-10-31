import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveIncomingMedia, type IIncomingMediaDeps } from './max-media.js';
import type { IMaxRawAttachment, IMaxRawMessage } from './max-message-mapper.js';

const message = (attachments: IMaxRawAttachment[]): IMaxRawMessage => ({
  recipient: { chat_id: 1, chat_type: 'dialog' },
  timestamp: 1,
  body: { mid: 'mid.9', text: null, attachments },
});

const deps = (): IIncomingMediaDeps & { uploadFile: ReturnType<typeof vi.fn> } => ({
  botToken: 'bot-token',
  apiBaseUrl: 'https://api.test',
  uploadFile: vi.fn((_body: unknown, meta: { name: string; mime: string }) =>
    Promise.resolve({ id: `file-${meta.name}`, name: meta.name, size: 3, mime: meta.mime }),
  ),
});

const fileResponse = (mime: string, status = 200): Response =>
  new Response(status === 200 ? new Uint8Array([1, 2, 3]) : null, { status, headers: { 'content-type': mime } });

describe('resolveIncomingMedia', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns nothing for a message without attachments', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(resolveIncomingMedia(message([]), deps())).resolves.toEqual({});
  });

  it('downloads image and file attachments from their direct URLs', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(fileResponse(url.includes('img') ? 'image/png' : 'application/pdf')),
    );
    vi.stubGlobal('fetch', fetchMock);
    const d = deps();
    const result = await resolveIncomingMedia(
      message([
        { type: 'image', payload: { url: 'https://cdn.test/img', token: 't1' } },
        { type: 'file', payload: { url: 'https://cdn.test/doc', token: 't2' }, filename: 'report.pdf', size: 3 },
        { type: 'sticker', payload: { url: 'https://cdn.test/sticker' } },
      ]),
      d,
    );
    expect(result.photo).toMatchObject({ name: 'photo-mid.9.png', mime: 'image/png' });
    expect(result.document).toMatchObject({ name: 'report.pdf', mime: 'application/pdf' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(d.uploadFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ createdBy: 'ingress:max' }));
  });

  it('resolves a video through GET /videos/{token}, preferring the best MP4', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
      Promise.resolve(
        url.startsWith('https://api.test/videos/')
          ? Response.json({ urls: { mp4_480: 'https://cdn.test/480', mp4_720: 'https://cdn.test/720' } })
          : fileResponse('video/mp4'),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await resolveIncomingMedia(
      message([{ type: 'video', payload: { url: 'https://max.ru/watch', token: 'vtok' } }]),
      deps(),
    );
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/videos/vtok');
    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: { Authorization: 'bot-token' } });
    expect(fetchMock.mock.calls[1][0]).toBe('https://cdn.test/720');
    expect(result.video).toMatchObject({ mime: 'video/mp4' });
  });

  it('resolves a failed download to null without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(fileResponse('audio/mpeg', 404))),
    );
    // oxlint-disable-next-line no-empty-function -- silences the expected warning.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await resolveIncomingMedia(
      message([{ type: 'audio', payload: { url: 'https://cdn.test/a' } }]),
      deps(),
    );
    expect(result).toEqual({ audio: null });
  });
});
