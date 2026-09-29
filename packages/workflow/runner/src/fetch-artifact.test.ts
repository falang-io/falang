import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchArtifact } from './fetch-artifact.js';

const okResponse = (body: string): Response => new Response(body, { status: 200 });

describe('fetchArtifact', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the dev endpoints and sends the per-project token header', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(okResponse('bundle-code'));
    fetchMock.mockResolvedValueOnce(okResponse('activities-code'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchArtifact({
      artifactBaseUrl: 'http://backend:4000',
      projectId: 'project-1',
      internalProjectToken: 'token-1',
    });

    expect(result).toEqual({ workflowBundle: 'bundle-code', activitiesSource: 'activities-code' });
    const [bundleCall, activitiesCall] = fetchMock.mock.calls;
    if (!bundleCall || !activitiesCall) throw new Error('fetch was not called twice');
    expect((bundleCall[0] as URL).pathname).toBe('/internal/artifacts/dev/project-1/workflow-bundle');
    expect((activitiesCall[0] as URL).pathname).toBe('/internal/artifacts/dev/project-1/activities');
    expect(bundleCall[1]?.headers).toMatchObject({ 'x-internal-project-token': 'token-1' });
  });

  it('fetches the versioned endpoints when buildId is set', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(okResponse('code')));
    vi.stubGlobal('fetch', fetchMock);

    await fetchArtifact({
      artifactBaseUrl: 'http://backend:4000',
      projectId: 'p1',
      internalProjectToken: 't',
      buildId: 'v3',
    });

    const [bundleCall] = fetchMock.mock.calls;
    if (!bundleCall) throw new Error('fetch was not called');
    expect((bundleCall[0] as URL).pathname).toBe('/internal/artifacts/versions/p1/v3/workflow-bundle');
  });

  it('throws with the status and body when a fetch is not ok', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(new Response('nope', { status: 404 })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchArtifact({ artifactBaseUrl: 'http://backend:4000', projectId: 'p1', internalProjectToken: 't' }),
    ).rejects.toThrow(/404/);
  });
});
