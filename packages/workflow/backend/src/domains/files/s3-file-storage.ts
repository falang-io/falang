import { PassThrough, Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  NotFound,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { NotFoundException } from '@nestjs/common';
import type {
  IFileStorage,
  IFileStorageGetResult,
  IFileStoragePutOptions,
  IFileStoragePutResult,
} from './file-storage.js';

export interface IS3FileStorageConfig {
  readonly endpoint?: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
}

/** A `PassThrough` that counts every byte it forwards — see `IFileStoragePutResult.size`'s own doc comment for why this can't just trust `contentLength`. */
const countingPassThrough = (onEnd: (size: number) => void): PassThrough => {
  let size = 0;
  const stream = new PassThrough();
  stream.on('data', (chunk: Buffer) => {
    size += chunk.length;
  });
  stream.on('end', () => onEnd(size));
  return stream;
};

/**
 * `IFileStorage` over a real S3-compatible bucket (MinIO in dev/e2e, Yandex Object Storage in prod —
 * see ADR 0038 (private) §2/"Decisions (2026-09-28)" #1). Never buffers
 * a whole object in memory: `putStream` hands the body straight to `@aws-sdk/lib-storage`'s `Upload`
 * (which itself streams multipart parts as needed), and `getStream` returns the SDK response's own
 * `Readable` body untouched.
 */
export class S3FileStorage implements IFileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: IS3FileStorageConfig) {
    const clientConfig: S3ClientConfig = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    };
    if (config.endpoint) clientConfig.endpoint = config.endpoint;
    this.client = new S3Client(clientConfig);
    this.bucket = config.bucket;
  }

  async putStream(
    key: string,
    body: Readable | ReadableStream,
    opts: IFileStoragePutOptions,
  ): Promise<IFileStoragePutResult> {
    let size = 0;
    const counted = countingPassThrough((total) => {
      size = total;
    });
    const source = body instanceof Readable ? body : Readable.fromWeb(body as never);
    source.pipe(counted);
    // Forward a source error onto the stream `Upload` is actually reading, so an upstream failure
    // (e.g. `FilesService`'s own size/quota `Transform` destroying itself) surfaces as `Upload.done()`
    // rejecting, rather than `counted` hanging forever waiting for data that will never arrive.
    source.on('error', (error) => counted.destroy(error));

    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: counted, ContentType: opts.contentType },
    });
    try {
      await upload.done();
    } catch (error) {
      // oxlint-disable-next-line no-empty-function -- best-effort cleanup of a possibly-partial upload; a failure here is already secondary to the real error being rethrown below.
      await this.delete(key).catch(() => {});
      throw error;
    }
    return { size };
  }

  async getStream(key: string): Promise<IFileStorageGetResult> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!response.Body) throw new NotFoundException(`Object "${key}" has no body`);
      return {
        body: response.Body as Readable,
        ...(typeof response.ContentLength === 'number' ? { contentLength: response.ContentLength } : {}),
      };
    } catch (error) {
      if (error instanceof NotFound) throw new NotFoundException(`Object "${key}" not found`);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((key) => ({ Key: key })) } }),
    );
  }
}
