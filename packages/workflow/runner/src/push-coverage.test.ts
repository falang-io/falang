import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushCoverage } from './push-coverage.js';

const okResponse = (): Response => new Response(null, { status: 204 });

describe('pushCoverage', () => {
  let coverageDir = '';

  beforeEach(async () => {
    coverageDir = await mkdtemp(join(tmpdir(), 'push-coverage-test-'));
  });

  afterEach(async () => {
    await rm(coverageDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('posts each coverage-*.json file to the per-project internal coverage endpoint', async () => {
    await writeFile(join(coverageDir, 'coverage-123-456.json'), '{"result":[]}');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await pushCoverage({
      coverageDir,
      artifactBaseUrl: 'http://backend:4000',
      projectId: 'project-1',
      internalProjectToken: 'token-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [call] = fetchMock.mock.calls;
    if (!call) throw new Error('fetch was not called');
    expect((call[0] as URL).pathname).toBe('/internal/coverage/project-1');
    expect(call[1]?.method).toBe('POST');
    expect(call[1]?.headers).toMatchObject({ 'x-internal-project-token': 'token-1' });
    expect(call[1]?.body).toBe('{"result":[]}');
  });

  it('ignores non-coverage files in the same directory', async () => {
    await writeFile(join(coverageDir, 'source-map-cache.json'), '{}');
    await writeFile(join(coverageDir, 'notes.txt'), 'hi');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await pushCoverage({
      coverageDir,
      artifactBaseUrl: 'http://backend:4000',
      projectId: 'project-1',
      internalProjectToken: 'token-1',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is a no-op when the coverage dir does not exist', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await pushCoverage({
      coverageDir: join(coverageDir, 'does-not-exist'),
      artifactBaseUrl: 'http://backend:4000',
      projectId: 'project-1',
      internalProjectToken: 'token-1',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws with the status and body when a push is not ok', async () => {
    await writeFile(join(coverageDir, 'coverage-1-1.json'), '{}');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      pushCoverage({ coverageDir, artifactBaseUrl: 'http://backend:4000', projectId: 'p1', internalProjectToken: 't' }),
    ).rejects.toThrow(/500/);
  });
});
