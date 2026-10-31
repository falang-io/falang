// oxlint-disable no-await-in-loop, init-declarations -- sequential assertions and per-test fixtures set in beforeEach.
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiskFileStorage } from './disk-file-storage.js';

const read = async (stream: Readable): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
};

describe('DiskFileStorage', () => {
  let dir: string;
  let storage: DiskFileStorage;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'disk-storage-'));
    storage = new DiskFileStorage(dir);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('round-trips an object under a nested key and counts bytes', async () => {
    const result = await storage.putStream('p1/f1', Readable.from([Buffer.from('hel'), Buffer.from('lo')]), {
      contentType: 'text/plain',
      contentLength: 999,
    });
    expect(result.size).toBe(5);
    const got = await storage.getStream('p1/f1');
    expect(got.contentLength).toBe(5);
    expect(await read(got.body)).toBe('hello');
  });

  it('leaves no temp file behind and overwrites atomically', async () => {
    await storage.putStream('p/f', Readable.from([Buffer.from('a')]), { contentType: 'x' });
    await storage.putStream('p/f', Readable.from([Buffer.from('bb')]), { contentType: 'x' });
    expect(await readdir(path.join(dir, 'p'))).toEqual(['f']);
  });

  it('removes the temp file when the source fails', async () => {
    const failing = new Readable({
      read() {
        this.destroy(new Error('boom'));
      },
    });
    await expect(storage.putStream('p/f', failing, { contentType: 'x' })).rejects.toThrow('boom');
    expect(await readdir(path.join(dir, 'p'))).toEqual([]);
  });

  it('throws NotFound for a missing key and ignores missing on delete', async () => {
    await expect(storage.getStream('p/none')).rejects.toThrow(/not found/);
    await expect(storage.delete('p/none')).resolves.toBeUndefined();
  });

  it('deletes one and many', async () => {
    for (const k of ['p/a', 'p/b']) await storage.putStream(k, Readable.from([Buffer.from('x')]), { contentType: 'x' });
    await storage.deleteMany(['p/a', 'p/b', 'p/missing']);
    await expect(storage.getStream('p/a')).rejects.toThrow();
    await expect(storage.getStream('p/b')).rejects.toThrow();
  });

  it('rejects path traversal and absolute keys', async () => {
    for (const key of ['../x', 'a/../../x', '/etc/passwd', '', 'a/..']) {
      await expect(storage.putStream(key, Readable.from([Buffer.from('x')]), { contentType: 'x' })).rejects.toThrow(
        /Invalid storage key/,
      );
      await expect(storage.getStream(key)).rejects.toThrow(/Invalid storage key/);
    }
  });
});
