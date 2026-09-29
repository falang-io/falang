import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { IApiFile } from './file.types.js';
import { GatewayFileUploadPort } from './gateway-file-upload.port.js';
import type { FilesService } from './files.service.js';

const API_FILE: IApiFile = {
  id: 'file-1',
  name: 'photo.png',
  size: 3,
  mime: 'image/png',
  createdBy: 'ingress:telegram',
  createdAt: '2026-09-28T00:00:00.000Z',
  expiresAt: null,
  publicUrl: null,
};

const makeFilesService = (): { service: FilesService; upload: ReturnType<typeof vi.fn> } => {
  const upload = vi.fn().mockResolvedValue(API_FILE);
  return { service: { upload } as unknown as FilesService, upload };
};

describe('GatewayFileUploadPort', () => {
  it('uploads a Uint8Array source by converting it to a Readable, and narrows the result to IFileRefLike', async () => {
    const { service, upload } = makeFilesService();
    const port = new GatewayFileUploadPort(service);

    const bytes = new Uint8Array([1, 2, 3]);
    const result = await port.upload('project-1', bytes, {
      name: 'photo.png',
      mime: 'image/png',
      createdBy: 'ingress:telegram',
    });

    expect(upload).toHaveBeenCalledTimes(1);
    const [projectId, stream, meta] = upload.mock.calls[0] as [string, Readable, Record<string, unknown>];
    expect(projectId).toBe('project-1');
    expect(stream).toBeInstanceOf(Readable);
    expect(meta).toEqual({ name: 'photo.png', mime: 'image/png', createdBy: 'ingress:telegram' });
    // Narrowed down from `IApiFile` (which has `createdBy`/`createdAt`/`expiresAt`, absent from `publicUrl: null`) —
    // matches `file-ref-mapper.ts`'s `toFileRef`.
    expect(result).toEqual({ id: 'file-1', name: 'photo.png', size: 3, mime: 'image/png' });
  });

  it('converts a web ReadableStream source too, and passes ttlSeconds through only when set', async () => {
    const { service, upload } = makeFilesService();
    const port = new GatewayFileUploadPort(service);

    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([9]));
        controller.close();
      },
    });
    await port.upload('project-2', webStream, {
      name: 'doc.txt',
      mime: 'text/plain',
      createdBy: 'run:wf-1',
      ttlSeconds: 3600,
    });

    const [, stream, meta] = upload.mock.calls[0] as [string, Readable, Record<string, unknown>];
    expect(stream).toBeInstanceOf(Readable);
    expect(meta).toEqual({ name: 'doc.txt', mime: 'text/plain', createdBy: 'run:wf-1', ttlSeconds: 3600 });
  });

  it('carries a publicUrl through when the underlying file already has one published', async () => {
    const { service } = makeFilesService();
    (service.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...API_FILE,
      publicUrl: 'https://backend.example/files/p/abc',
    });
    const port = new GatewayFileUploadPort(service);

    const result = await port.upload('project-1', new Uint8Array([1]), {
      name: 'x',
      mime: 'text/plain',
      createdBy: 'run:wf-1',
    });

    expect(result).toEqual({
      id: 'file-1',
      name: 'photo.png',
      size: 3,
      mime: 'image/png',
      publicUrl: 'https://backend.example/files/p/abc',
    });
  });
});
