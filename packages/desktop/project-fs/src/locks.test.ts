import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getActiveLock, LOCKS_SIDECAR_NAME, readLocks, writeLocks, type IDocumentLock } from './locks.js';

const lock = (overrides: Partial<IDocumentLock> = {}): IDocumentLock => ({
  documentId: 'doc-1',
  owner: 'session-1',
  acquiredAt: '2026-09-18T10:00:00.000Z',
  expiresAt: '2026-09-18T10:05:00.000Z',
  ...overrides,
});

describe('locks', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-locks-test-'));
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('returns [] when no locks sidecar has ever been written', async () => {
    expect(await readLocks(projectDir)).toEqual([]);
  });

  it('writes and reads back locks, landing on disk at .falang-locks.json', async () => {
    await writeLocks(projectDir, [lock()]);

    const now = new Date('2026-09-18T10:01:00.000Z').getTime();
    expect(await readLocks(projectDir, now)).toEqual([lock()]);

    const raw = await fs.readFile(path.join(projectDir, '.falang-locks.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ locks: [lock()] });
  });

  it('filters out expired locks relative to the given `now`', async () => {
    await writeLocks(projectDir, [lock({ documentId: 'expired', expiresAt: '2026-09-18T10:05:00.000Z' })]);

    const past = new Date('2026-09-18T10:04:00.000Z').getTime();
    const future = new Date('2026-09-18T10:06:00.000Z').getTime();
    expect(await readLocks(projectDir, past)).toHaveLength(1);
    expect(await readLocks(projectDir, future)).toEqual([]);
  });

  it('getActiveLock returns the matching non-expired lock, or null', () => {
    const locks = [lock({ documentId: 'a' }), lock({ documentId: 'b', expiresAt: '2026-09-18T09:00:00.000Z' })];
    const now = new Date('2026-09-18T10:01:00.000Z').getTime();

    expect(getActiveLock(locks, 'a', now)).toEqual(lock({ documentId: 'a' }));
    expect(getActiveLock(locks, 'b', now)).toBeNull();
    expect(getActiveLock(locks, 'missing', now)).toBeNull();
  });

  it('LOCKS_SIDECAR_NAME has no .json suffix (readSidecar/writeSidecar append it)', () => {
    expect(LOCKS_SIDECAR_NAME).toBe('.falang-locks');
  });
});
