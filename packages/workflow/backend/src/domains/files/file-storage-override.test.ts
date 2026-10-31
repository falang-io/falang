import { describe, expect, it, vi } from 'vitest';
import { pickFileStorage } from './file-storage.js';
import { InMemoryFileStorage } from './in-memory-file-storage.js';

describe('pickFileStorage', () => {
  it('returns the override without building S3', () => {
    const override = new InMemoryFileStorage();
    const createS3 = vi.fn(() => new InMemoryFileStorage());
    expect(pickFileStorage(override, createS3)).toBe(override);
    expect(createS3).not.toHaveBeenCalled();
  });
  it('builds S3 when there is no override', () => {
    const s3 = new InMemoryFileStorage();
    expect(pickFileStorage(null, () => s3)).toBe(s3);
  });
});
