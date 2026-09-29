import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { resolveIncomingMedia, type IIncomingMediaDeps } from './telegram-media.js';
import type { ITelegramRawMessage } from './telegram-message-mapper.js';

const jsonResponse = (body: unknown, ok = true, status = ok ? 200 : 500): Response =>
  ({ ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) }) as Response;

const uploadedFile = { id: 'file-1', name: 'photo.jpg', size: 3, mime: 'image/jpeg' };

describe('resolveIncomingMedia', () => {
  // oxlint-disable-next-line init-declarations
  let uploadFile: Mock<IIncomingMediaDeps['uploadFile']>;
  // oxlint-disable-next-line init-declarations
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    uploadFile = vi.fn().mockResolvedValue(uploadedFile);
    // oxlint-disable-next-line no-empty-function -- silences the deliberate console.warn calls under test, asserted separately where relevant.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
  });

  const deps = () => ({ botToken: 'bot-token', apiBaseUrl: 'https://mocks.test/telegram', uploadFile });

  it('returns an empty object when the message carries no media at all', async () => {
    const raw: ITelegramRawMessage = { message_id: 1, date: 0, chat: { id: 1, type: 'private' } };
    expect(await resolveIncomingMedia(raw, deps())).toEqual({});
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('resolves the largest photo via getFile -> download -> uploadFile', async () => {
    const fetchMock = vi.fn((input: string | URL) => {
      const url = input.toString();
      if (url.includes('getFile')) return Promise.resolve(jsonResponse({ result: { file_path: 'photos/f1.jpg' } }));
      if (url.includes('/file/bot')) {
        return Promise.resolve({ ok: true, body: new ReadableStream() } as Response);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const raw: ITelegramRawMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      photo: [
        { file_id: 'small', file_unique_id: 'su', width: 90, height: 90 },
        { file_id: 'big', file_unique_id: 'bu', width: 800, height: 800 },
      ],
    };
    const result = await resolveIncomingMedia(raw, deps());

    expect(result.photo).toEqual(uploadedFile);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://mocks.test/telegram/botbot-token/getFile',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ file_id: 'big' }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith('https://mocks.test/telegram/file/botbot-token/photos/f1.jpg');
    // Bot API's `PhotoSize` never carries a `mime_type` — Telegram always re-encodes photos to JPEG
    // server-side, so this falls back to `image/jpeg` (not the generic `application/octet-stream`
    // every other kind falls back to), with a `.jpg` extension (not `extensionFromMime`'s own `jpeg`).
    expect(uploadFile).toHaveBeenCalledWith(expect.anything(), {
      name: 'photo-bu.jpg',
      mime: 'image/jpeg',
      createdBy: 'ingress:telegram',
    });
  });

  it('resolves document/voice/audio/video the same way, each independently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL) =>
        Promise.resolve(
          input.toString().includes('getFile')
            ? jsonResponse({ result: { file_path: 'p' } })
            : ({ ok: true, body: new ReadableStream() } as Response),
        ),
      ),
    );
    const raw: ITelegramRawMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      document: { file_id: 'd', file_unique_id: 'du', file_name: 'report.pdf', mime_type: 'application/pdf' },
      voice: { file_id: 'v', file_unique_id: 'vu', duration: 3, mime_type: 'audio/ogg' },
      audio: { file_id: 'a', file_unique_id: 'au', duration: 3 },
      video: { file_id: 'x', file_unique_id: 'xu', width: 1, height: 1, duration: 1 },
    };
    const result = await resolveIncomingMedia(raw, deps());
    expect(result.document).toEqual(uploadedFile);
    expect(result.voice).toEqual(uploadedFile);
    expect(result.audio).toEqual(uploadedFile);
    expect(result.video).toEqual(uploadedFile);
    expect(uploadFile).toHaveBeenCalledTimes(4);
  });

  it('defaults a voice message with no mime_type to audio/ogg — Bot API voice is always Ogg/Opus', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL) =>
        Promise.resolve(
          input.toString().includes('getFile')
            ? jsonResponse({ result: { file_path: 'voice/v1.oga' } })
            : ({ ok: true, body: new ReadableStream() } as Response),
        ),
      ),
    );
    const raw: ITelegramRawMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      voice: { file_id: 'v', file_unique_id: 'vu', duration: 3 },
    };
    await resolveIncomingMedia(raw, deps());
    expect(uploadFile).toHaveBeenCalledWith(expect.anything(), {
      name: 'voice-vu.ogg',
      mime: 'audio/ogg',
      createdBy: 'ingress:telegram',
    });
  });

  it('resolves to null (not throwing) and warns when the file is over the 20 MB getFile limit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const raw: ITelegramRawMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      document: { file_id: 'd', file_unique_id: 'du', file_size: 21 * 1024 * 1024 },
    };
    const result = await resolveIncomingMedia(raw, deps());
    expect(result.document).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('20 MB getFile limit'));
  });

  it('resolves to null and warns when getFile responds non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 400)));
    const raw: ITelegramRawMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      document: { file_id: 'd', file_unique_id: 'du' },
    };
    const result = await resolveIncomingMedia(raw, deps());
    expect(result.document).toBeNull();
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('resolves to null and warns when the download itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL) =>
        Promise.resolve(
          input.toString().includes('getFile')
            ? jsonResponse({ result: { file_path: 'p' } })
            : ({ ok: false, status: 404, text: () => Promise.resolve('') } as Response),
        ),
      ),
    );
    const raw: ITelegramRawMessage = {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      document: { file_id: 'd', file_unique_id: 'du' },
    };
    const result = await resolveIncomingMedia(raw, deps());
    expect(result.document).toBeNull();
    expect(uploadFile).not.toHaveBeenCalled();
  });
});
