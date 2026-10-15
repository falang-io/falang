import { PassThrough, Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFound } from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import { S3FileStorage } from './s3-file-storage.js';

const state = vi.hoisted(() => ({
  sent: [] as { name: string; input: Record<string, unknown> }[],
  sendImpl: (_command: unknown): Promise<unknown> => Promise.resolve({}),
  uploadImpl: (_params: { Body: Readable }): Promise<unknown> => Promise.resolve({}),
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(function uploadStub(options: { params: { Body: Readable } }) {
    return { done: () => state.uploadImpl(options.params) };
  }),
}));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    S3Client: vi.fn().mockImplementation(function clientStub() {
      return {
        send: (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
          state.sent.push({ name: command.constructor.name, input: command.input });
          return state.sendImpl(command);
        },
      };
    }),
  };
});

const makeStorage = () =>
  new S3FileStorage({
    endpoint: 'http://minio:9000',
    region: 'us-east-1',
    bucket: 'bkt',
    accessKeyId: 'a',
    secretAccessKey: 's',
    forcePathStyle: true,
  });

const drain = async (stream: Readable): Promise<number> => {
  let total = 0;
  for await (const chunk of stream) total += (chunk as Buffer).length;
  return total;
};

describe('S3FileStorage', () => {
  beforeEach(() => {
    state.sent.length = 0;
    state.sendImpl = () => Promise.resolve({});
    state.uploadImpl = async (params) => {
      await drain(params.Body);
    };
  });

  it('putStream returns the exact number of bytes that passed through', async () => {
    const result = await makeStorage().putStream('k', Readable.from([Buffer.from('abc'), Buffer.from('defg')]), {
      contentType: 'text/plain',
    });

    expect(result.size).toBe(7);
  });

  it('putStream accepts a web ReadableStream body', async () => {
    const web = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });

    const result = await makeStorage().putStream('k', web, { contentType: 'application/octet-stream' });

    expect(result.size).toBe(3);
  });

  it('deletes the possibly-partial object and rethrows when the upload fails', async () => {
    state.uploadImpl = () => Promise.reject(new Error('upload failed'));

    await expect(makeStorage().putStream('k', Readable.from([Buffer.from('x')]), { contentType: 't' })).rejects.toThrow(
      'upload failed',
    );

    expect(state.sent).toEqual([{ name: 'DeleteObjectCommand', input: { Bucket: 'bkt', Key: 'k' } }]);
  });

  it('still rethrows the upload error when the cleanup delete fails too', async () => {
    state.uploadImpl = () => Promise.reject(new Error('upload failed'));
    state.sendImpl = () => Promise.reject(new Error('delete failed'));

    await expect(makeStorage().putStream('k', Readable.from([Buffer.from('x')]), { contentType: 't' })).rejects.toThrow(
      'upload failed',
    );
  });

  it('a source error (e.g. the quota guard) reaches Upload.done() instead of hanging, and cleans up', async () => {
    state.uploadImpl = async (params) => {
      await drain(params.Body);
    };
    const source = new PassThrough();
    const promise = makeStorage().putStream('k', source, { contentType: 't' });
    source.write(Buffer.from('abc'));
    source.destroy(new Error('over quota'));

    await expect(promise).rejects.toThrow('over quota');
    expect(state.sent.map((c) => c.name)).toEqual(['DeleteObjectCommand']);
  });

  it('getStream returns the body and content length', async () => {
    const body = Readable.from([Buffer.from('hi')]);
    state.sendImpl = () => Promise.resolve({ Body: body, ContentLength: 2 });

    const result = await makeStorage().getStream('k');

    expect(result.body).toBe(body);
    expect(result.contentLength).toBe(2);
    expect(state.sent[0]).toEqual({ name: 'GetObjectCommand', input: { Bucket: 'bkt', Key: 'k' } });
  });

  it('getStream omits contentLength when S3 does not report it', async () => {
    state.sendImpl = () => Promise.resolve({ Body: Readable.from([]) });

    const result = await makeStorage().getStream('k');

    expect(result).not.toHaveProperty('contentLength');
  });

  it('getStream maps a missing object to NotFoundException', async () => {
    state.sendImpl = () => Promise.reject(new NotFound({ message: 'nope', $metadata: {} }));

    await expect(makeStorage().getStream('k')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getStream maps an empty body to NotFoundException', async () => {
    state.sendImpl = () => Promise.resolve({});

    await expect(makeStorage().getStream('k')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getStream rethrows other errors untouched', async () => {
    state.sendImpl = () => Promise.reject(new Error('boom'));

    await expect(makeStorage().getStream('k')).rejects.toThrow('boom');
  });

  it('deleteMany sends one batch with all keys, and nothing for an empty list', async () => {
    const storage = makeStorage();

    await storage.deleteMany([]);
    await storage.deleteMany(['a', 'b']);

    expect(state.sent).toEqual([
      { name: 'DeleteObjectsCommand', input: { Bucket: 'bkt', Delete: { Objects: [{ Key: 'a' }, { Key: 'b' }] } } },
    ]);
  });
});
