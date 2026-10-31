import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { NotFoundException } from '@nestjs/common';
import type {
  IFileStorage,
  IFileStorageGetResult,
  IFileStoragePutOptions,
  IFileStoragePutResult,
} from '@falang/workflow-backend';

/**
 * Local-mode `IFileStorage`: objects are plain files under `rootDir`, one per key (`<projectId>/<fileId>`).
 * Writes go to a temp name and are renamed into place, so a reader never sees a half-written object; the size is
 * counted as bytes pass through, never taken from `contentLength`.
 */
export class DiskFileStorage implements IFileStorage {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  /** Maps a key to a path inside `rootDir`; refuses absolute keys and any `..` segment. */
  private resolveKey(key: string): string {
    if (!key || path.isAbsolute(key) || key.includes('\0') || key.split(/[\\/]/).includes('..')) {
      throw new Error(`Invalid storage key "${key}"`);
    }
    const target = path.resolve(this.rootDir, key);
    if (!target.startsWith(this.rootDir + path.sep)) throw new Error(`Invalid storage key "${key}"`);
    return target;
  }

  async putStream(
    key: string,
    body: Readable | ReadableStream,
    _opts: IFileStoragePutOptions,
  ): Promise<IFileStoragePutResult> {
    const target = this.resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    const source = body instanceof Readable ? body : Readable.fromWeb(body as never);
    let size = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        callback(null, chunk);
      },
    });
    try {
      await pipeline(source, counter, createWriteStream(temp));
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    return { size };
  }

  async getStream(key: string): Promise<IFileStorageGetResult> {
    const target = this.resolveKey(key);
    const info = await stat(target).catch(() => null);
    if (!info) throw new NotFoundException(`Object "${key}" not found`);
    return { body: createReadStream(target), contentLength: info.size };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }
}
