import type { Readable } from 'node:stream';

/** DI token for `IFileStorage` — `FilesModule` binds it to `S3FileStorage` for real use, the test suite/e2e harness bind it to `InMemoryFileStorage`. */
export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface IFileStoragePutOptions {
  readonly contentType: string;
  /** Advisory only — a stream's true length isn't always known up front (see the ADR's §2), so implementations must never trust this over what they actually read. */
  readonly contentLength?: number;
}

export interface IFileStoragePutResult {
  /** The exact number of bytes actually written — computed by counting the stream as it passes through, never from `contentLength`/an S3 response field, since either can be absent. */
  readonly size: number;
}

export interface IFileStorageGetResult {
  readonly body: Readable;
  readonly contentLength?: number;
}

/**
 * The narrow port `FilesService` depends on — see ADR 0038 (private)
 * §2. Deliberately knows nothing about `files` rows/quotas/TTL; it's a plain streaming key-value
 * store keyed by `storage_key`.
 */
export interface IFileStorage {
  putStream(key: string, body: Readable | ReadableStream, opts: IFileStoragePutOptions): Promise<IFileStoragePutResult>;
  getStream(key: string): Promise<IFileStorageGetResult>;
  delete(key: string): Promise<void>;
  deleteMany(keys: readonly string[]): Promise<void>;
}
