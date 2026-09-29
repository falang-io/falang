import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` factories are hoisted above every other statement — see `schedule-status-store.test.ts` for
// the same `vi.hoisted` pattern, needed so the factory below can close over these before they'd
// otherwise exist.
const { listFiles, uploadFile, deleteFile, publishFile, unpublishFile } = vi.hoisted(() => ({
  listFiles: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  publishFile: vi.fn(),
  unpublishFile: vi.fn(),
}));
vi.mock('./api-client.js', () => ({
  workflowApi: {
    listFiles: (...args: unknown[]) => listFiles(...args),
    uploadFile: (...args: unknown[]) => uploadFile(...args),
    deleteFile: (...args: unknown[]) => deleteFile(...args),
    publishFile: (...args: unknown[]) => publishFile(...args),
    unpublishFile: (...args: unknown[]) => unpublishFile(...args),
  },
}));

const { FilesStore } = await import('./files-store.js');

const FILE_FIXTURE = {
  id: 'file-1',
  name: 'report.pdf',
  size: 1024,
  mime: 'application/pdf',
  createdBy: 'user:1',
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  publicUrl: null,
};

const USAGE_FIXTURE = { usedBytes: 1024, maxProjectFilesBytes: 1_073_741_824, maxFileBytes: 104_857_600 };

describe('FilesStore', () => {
  beforeEach(() => {
    listFiles.mockReset();
    uploadFile.mockReset();
    deleteFile.mockReset();
    publishFile.mockReset();
    unpublishFile.mockReset();
  });

  it('loads the file list and usage for a project', async () => {
    listFiles.mockResolvedValue({ files: [FILE_FIXTURE], usage: USAGE_FIXTURE });
    const store = new FilesStore();

    await store.load('project-1');

    expect(listFiles).toHaveBeenCalledWith('project-1');
    expect(store.files).toEqual([FILE_FIXTURE]);
    expect(store.usage).toEqual(USAGE_FIXTURE);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('upload() sends the file and reloads the list', async () => {
    listFiles
      .mockResolvedValueOnce({ files: [], usage: USAGE_FIXTURE })
      .mockResolvedValueOnce({ files: [FILE_FIXTURE], usage: USAGE_FIXTURE });
    uploadFile.mockResolvedValue(FILE_FIXTURE);
    const store = new FilesStore();
    await store.load('project-1');

    const file = new File(['hello'], 'report.pdf', { type: 'application/pdf' });
    await store.upload(file, 24);

    expect(uploadFile).toHaveBeenCalledWith('project-1', file, 24);
    expect(listFiles).toHaveBeenCalledTimes(2);
    expect(store.files).toEqual([FILE_FIXTURE]);
  });

  it('publish() updates just that file with its new publicUrl, without reloading the whole list', async () => {
    listFiles.mockResolvedValue({ files: [FILE_FIXTURE], usage: USAGE_FIXTURE });
    const published = { ...FILE_FIXTURE, publicUrl: 'https://backend.example/files/p/abc' };
    publishFile.mockResolvedValue(published);
    const store = new FilesStore();
    await store.load('project-1');

    const result = await store.publish('file-1');

    expect(publishFile).toHaveBeenCalledWith('project-1', 'file-1');
    expect(result).toEqual(published);
    expect(store.files).toEqual([published]);
    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it('unpublish() updates just that file, dropping its publicUrl', async () => {
    const published = { ...FILE_FIXTURE, publicUrl: 'https://backend.example/files/p/abc' };
    listFiles.mockResolvedValue({ files: [published], usage: USAGE_FIXTURE });
    unpublishFile.mockResolvedValue(FILE_FIXTURE);
    const store = new FilesStore();
    await store.load('project-1');

    const result = await store.unpublish('file-1');

    expect(unpublishFile).toHaveBeenCalledWith('project-1', 'file-1');
    expect(result).toEqual(FILE_FIXTURE);
    expect(store.files).toEqual([FILE_FIXTURE]);
  });

  it('remove() deletes and reloads the list', async () => {
    listFiles
      .mockResolvedValueOnce({ files: [FILE_FIXTURE], usage: USAGE_FIXTURE })
      .mockResolvedValueOnce({ files: [], usage: { ...USAGE_FIXTURE, usedBytes: 0 } });
    deleteFile.mockResolvedValue(null);
    const store = new FilesStore();
    await store.load('project-1');

    await store.remove('file-1');

    expect(deleteFile).toHaveBeenCalledWith('project-1', 'file-1');
    expect(store.files).toEqual([]);
  });

  it('records a load error without throwing', async () => {
    listFiles.mockRejectedValue(new Error('network down'));
    const store = new FilesStore();

    await store.load('project-1');

    expect(store.error).toBe('network down');
    expect(store.loading).toBe(false);
    expect(store.files).toEqual([]);
  });

  it('records an upload error and rethrows it to the caller', async () => {
    listFiles.mockResolvedValue({ files: [], usage: USAGE_FIXTURE });
    uploadFile.mockRejectedValue(new Error('file too large'));
    const store = new FilesStore();
    await store.load('project-1');

    const file = new File(['x'], 'big.bin');
    await expect(store.upload(file)).rejects.toThrow('file too large');
    expect(store.error).toBe('file too large');
  });

  it('throws if a mutating call happens before load()', async () => {
    const store = new FilesStore();
    await expect(store.remove('file-1')).rejects.toThrow('FilesStore.load() must be called before mutating files');
  });
});
