import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteFile,
  fileToDataUrl,
  getFileMeta,
  openFileStream,
  publishFile,
  readFileBytes,
  unpublishFile,
  uploadFileFromStream,
} from './activity-helpers.js';
import type { IFileRef } from './file-types.js';

const stubEnv = (): void => {
  vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
  vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
  vi.stubEnv('PROJECT_ID', 'project-1');
};

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

const file: IFileRef = { id: 'file-1', name: 'report.pdf', size: 1024, mime: 'application/pdf' };

/** Typed so `fetchMock.mock.calls[0]` narrows to `[string, RequestInit]` instead of `[]` (`vi.fn`
 *  infers a mock's parameter tuple from the implementation callback's own signature) — no explicit
 *  return-type annotation, which would widen it back to the generic (parameterless) `Mock` type. */
const stubFetch = (status: number, body: unknown) =>
  vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(jsonResponse(status, body)));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('uploadFileFromStream', () => {
  it('POSTs to /internal/files/:projectId with the expected headers and the raw body', async () => {
    stubEnv();
    const fetchMock = stubFetch(201, file);
    vi.stubGlobal('fetch', fetchMock);

    const bytes = new Uint8Array([1, 2, 3]);
    const result = await uploadFileFromStream(bytes, { name: 'a b.txt', mime: 'text/plain', ttlSeconds: 3600 });

    expect(result).toEqual(file);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('http://backend.test/internal/files/project-1');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('text/plain');
    expect(init.headers['x-file-name']).toBe(encodeURIComponent('a b.txt'));
    expect(init.headers['x-file-ttl-seconds']).toBe('3600');
    expect(init.headers['x-created-by']).toBe('run:unknown');
    expect(init.headers['x-internal-project-token']).toBe('ptok');
    expect(init.body).toBe(bytes);
  });

  it('defaults mime to application/octet-stream and createdBy to run:unknown when not given', async () => {
    stubEnv();
    const fetchMock = stubFetch(201, file);
    vi.stubGlobal('fetch', fetchMock);

    await uploadFileFromStream(new Uint8Array(), { name: 'x', mime: '' });

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers['content-type']).toBe('application/octet-stream');
    expect(init.headers['x-file-ttl-seconds']).toBeUndefined();
  });

  it('sets duplex: half only when the body is a real ReadableStream', async () => {
    stubEnv();
    const fetchMock = stubFetch(201, file);
    vi.stubGlobal('fetch', fetchMock);

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => controller.close(),
    });
    await uploadFileFromStream(stream, { name: 'x', mime: 'text/plain' });

    const [, init] = fetchMock.mock.calls[0] as [string, { duplex?: string }];
    expect(init.duplex).toBe('half');
  });

  it('forwards WORKFLOW_ENV as x-workflow-env when set', async () => {
    stubEnv();
    vi.stubEnv('WORKFLOW_ENV', 'dev');
    const fetchMock = stubFetch(201, file);
    vi.stubGlobal('fetch', fetchMock);

    await uploadFileFromStream(new Uint8Array(), { name: 'x', mime: 'text/plain' });

    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers['x-workflow-env']).toBe('dev');
  });

  it('throws a clear "over the limit" error on a 413', async () => {
    stubEnv();
    vi.stubGlobal('fetch', stubFetch(413, {}));

    await expect(
      uploadFileFromStream(new Uint8Array(), { name: 'big.bin', mime: 'application/octet-stream' }),
    ).rejects.toThrow(/over the project's file size\/quota limit/);
  });

  it('throws when BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured', async () => {
    await expect(uploadFileFromStream(new Uint8Array(), { name: 'x', mime: 'text/plain' })).rejects.toThrow(
      /not configured for this runner process/,
    );
  });
});

describe('openFileStream', () => {
  it('GETs /internal/files/:projectId/:fileId and returns the response body', async () => {
    stubEnv();
    const body = new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, body, text: () => Promise.resolve('') }) as Promise<Response>),
    );

    const result = await openFileStream(file);
    expect(result).toBe(body);
  });
});

describe('readFileBytes', () => {
  it('refuses up front when file.size exceeds maxBytes, without calling fetch', async () => {
    stubEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(readFileBytes(file, 10)).rejects.toThrow(/over the 10-byte limit/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the downloaded bytes as a Uint8Array', async () => {
    stubEnv();
    const bytes = new Uint8Array([9, 8, 7]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(bytes.buffer) }) as Promise<Response>),
    );

    const result = await readFileBytes(file, 10_000);
    expect(Array.from(result)).toEqual([9, 8, 7]);
  });
});

describe('fileToDataUrl', () => {
  it("base64-encodes the bytes into a data: URL using the file's mime", async () => {
    stubEnv();
    // bytes 72, 105 spell "Hi"
    const bytes = new Uint8Array([72, 105]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(bytes.buffer) }) as Promise<Response>),
    );

    const result = await fileToDataUrl(file, 10_000);
    expect(result).toBe(`data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`);
  });
});

describe('getFileMeta', () => {
  it('GETs /internal/files/:projectId/:fileId/meta', async () => {
    stubEnv();
    const fetchMock = stubFetch(200, file);
    vi.stubGlobal('fetch', fetchMock);

    const result = await getFileMeta('file-1');
    expect(result).toEqual(file);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/internal/files/project-1/file-1/meta',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('deleteFile', () => {
  it('DELETEs /internal/files/:projectId/:fileId', async () => {
    stubEnv();
    const fetchMock = stubFetch(200, {});
    vi.stubGlobal('fetch', fetchMock);

    await deleteFile(file);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/internal/files/project-1/file-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('throws with the response status/body on failure', async () => {
    stubEnv();
    vi.stubGlobal('fetch', stubFetch(404, {}));

    await expect(deleteFile(file)).rejects.toThrow(/404/);
  });
});

describe('publishFile / unpublishFile', () => {
  it('publishFile POSTs .../publish and returns the File with publicUrl', async () => {
    stubEnv();
    const published = { ...file, publicUrl: 'http://backend.test/files/p/tok' };
    const fetchMock = stubFetch(200, published);
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishFile(file);
    expect(result).toEqual(published);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/internal/files/project-1/file-1/publish',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('unpublishFile DELETEs .../publish and returns the File without publicUrl', async () => {
    stubEnv();
    const fetchMock = stubFetch(200, file);
    vi.stubGlobal('fetch', fetchMock);

    const result = await unpublishFile(file);
    expect(result).toEqual(file);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend.test/internal/files/project-1/file-1/publish',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
