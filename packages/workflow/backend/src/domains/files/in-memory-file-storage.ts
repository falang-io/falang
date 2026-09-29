import { Readable } from 'node:stream';
import { NotFoundException } from '@nestjs/common';
import type { IFileStorage, IFileStorageGetResult, IFileStoragePutResult } from './file-storage.js';

/**
 * An `IFileStorage` that keeps every object in a plain `Map<string, Buffer>` — no S3/MinIO needed.
 * Used by `files.service.test.ts` and by the sqlite e2e harness (`test-utils/e2e-app.ts`) so
 * `FilesModule`'s HTTP surface is exercisable without a real bucket. Not exported for any other
 * purpose — buffering whole objects in process memory is exactly what the real `S3FileStorage`
 * avoids.
 */
export class InMemoryFileStorage implements IFileStorage {
  private readonly objects = new Map<string, Buffer>();

  async putStream(key: string, body: Readable | ReadableStream): Promise<IFileStoragePutResult> {
    const source = body instanceof Readable ? body : Readable.fromWeb(body as never);
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk as Uint8Array));
    }
    const buffer = Buffer.concat(chunks);
    this.objects.set(key, buffer);
    return { size: buffer.length };
  }

  // oxlint-disable-next-line require-await -- kept async to match `IFileStorage`'s `Promise`-returning signature; the lookup itself is synchronous.
  async getStream(key: string): Promise<IFileStorageGetResult> {
    const buffer = this.objects.get(key);
    if (!buffer) throw new NotFoundException(`Object "${key}" not found`);
    return { body: Readable.from(buffer), contentLength: buffer.length };
  }

  // oxlint-disable-next-line require-await -- kept async to match `IFileStorage`'s `Promise`-returning signature.
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  // oxlint-disable-next-line require-await -- kept async to match `IFileStorage`'s `Promise`-returning signature.
  async deleteMany(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
  }

  /** Test-only introspection — whether an upload that should have been aborted actually left no object behind. */
  has(key: string): boolean {
    return this.objects.has(key);
  }

  /** Test-only introspection — how many objects are currently stored, for asserting an aborted upload left nothing behind without needing to know its (randomly generated) key. */
  get size(): number {
    return this.objects.size;
  }
}
