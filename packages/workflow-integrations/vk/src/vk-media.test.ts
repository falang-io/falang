import { afterEach, describe, expect, it, vi } from 'vitest';
import { bestPhotoUrl, resolveIncomingMedia, type IIncomingMediaDeps } from './vk-media.js';
import type { IVkRawAttachment, IVkRawMessage } from './vk-message-mapper.js';

const message = (attachments: IVkRawAttachment[]): IVkRawMessage => ({ id: 9, peer_id: 1, text: '', attachments });

const deps = (): IIncomingMediaDeps & { uploadFile: ReturnType<typeof vi.fn> } => ({
  uploadFile: vi.fn((_body: unknown, meta: { name: string; mime: string }) =>
    Promise.resolve({ id: `file-${meta.name}`, name: meta.name, size: 3, mime: meta.mime }),
  ),
});

const fileResponse = (mime: string, status = 200): Response =>
  new Response(status === 200 ? new Uint8Array([1, 2, 3]) : null, { status, headers: { 'content-type': mime } });

const mimeByUrl = (url: string): string => {
  if (url.includes('img')) return 'image/png';
  return url.includes('doc') ? 'application/pdf' : 'audio/mpeg';
};

describe('bestPhotoUrl', () => {
  it('prefers orig_photo, else the largest size by area', () => {
    expect(bestPhotoUrl({ orig_photo: { url: 'o' }, sizes: [{ url: 's', width: 1, height: 1 }] })).toBe('o');
    expect(
      bestPhotoUrl({
        sizes: [
          { url: 'small', width: 10, height: 10 },
          { url: 'big', width: 100, height: 50 },
          { url: 'tall', width: 20, height: 20 },
        ],
      }),
    ).toBe('big');
    expect(bestPhotoUrl({ sizes: [] })).toBeNull();
  });
});

describe('resolveIncomingMedia', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns nothing for a message without attachments', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(resolveIncomingMedia(message([]), deps())).resolves.toEqual({});
  });

  it('downloads photo, document and voice attachments', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(fileResponse(mimeByUrl(url))));
    vi.stubGlobal('fetch', fetchMock);
    const d = deps();
    const result = await resolveIncomingMedia(
      message([
        { type: 'photo', photo: { sizes: [{ url: 'https://cdn.test/img', width: 2, height: 2 }] } },
        { type: 'doc', doc: { url: 'https://cdn.test/doc', title: 'report', ext: 'pdf' } },
        { type: 'audio_message', audio_message: { link_mp3: 'https://cdn.test/voice.mp3', link_ogg: 'https://x/o' } },
        { type: 'sticker' },
      ]),
      d,
    );
    expect(result.photo).toMatchObject({ name: 'photo-9.png', mime: 'image/png' });
    expect(result.document).toMatchObject({ name: 'report.pdf', mime: 'application/pdf' });
    expect(result.voice).toMatchObject({ name: 'voice-9.mpeg', mime: 'audio/mpeg' });
    expect(d.uploadFile).toHaveBeenCalledTimes(3);
    expect(d.uploadFile.mock.calls[0][1]).toMatchObject({ createdBy: 'ingress:vk' });
  });

  it('falls back to link_ogg and resolves to null on a failed download', async () => {
    const fetchMock = vi.fn((_url: string) => Promise.resolve(fileResponse('x', 404)));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {
      // silence the expected warning
    });
    const result = await resolveIncomingMedia(
      message([{ type: 'audio_message', audio_message: { link_ogg: 'https://cdn.test/v.ogg' } }]),
      deps(),
    );
    expect(result.voice).toBeNull();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://cdn.test/v.ogg');
  });
});
