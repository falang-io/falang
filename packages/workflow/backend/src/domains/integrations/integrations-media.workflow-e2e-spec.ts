import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INode } from '@falang/dto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  WORKFLOW_E2E_MEDIA_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
} from '../../test-utils/workflow-e2e-client.js';
import { buildFunctionNode, buildReturnNode } from '../../test-utils/workflow-e2e-fixtures.js';
import {
  buildFilesInfoNode,
  buildMediaAudioExtractNode,
  buildMediaImageResizeNode,
  buildMediaProbeNode,
  buildMediaVideoThumbnailNode,
} from '../../test-utils/workflow-e2e-fixtures-media.js';

// oxlint-disable-next-line unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
const FIXTURES_DIR = join(__dirname, '..', '..', '..', 'test-fixtures', 'media');

interface IMediaInfoResult {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly bitrate: number;
  readonly mime: string;
}

interface IFileRefResult {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
}

/**
 * Workflow-tier spec for ADR 0041 (private) §5's e2e bullet — the `media`
 * vendor's real ffmpeg-backed ops (`media-probe`/`media-image-resize`/`media-video-thumbnail`/
 * `media-audio-extract`), driven through a real compiled function on a real runner pod against the
 * real `media` service (`packages/workflow/media`, `docker-compose.workflow-e2e.yml`'s `media`
 * service). See `integrations-files-download.workflow-e2e-spec.ts` for the sibling `files`-vendor
 * spec this one builds on top of (`files-info` turns a project-API-uploaded file's plain `fileId`
 * into an in-scope `File` variable).
 *
 * Unlike every other spec in this directory, the fixture project isn't built via a single
 * `POST /projects/import` — the function body needs the *real* ids of two files uploaded through
 * the project-scoped files API, and that API only accepts uploads into an already-existing project
 * (chicken-and-egg with a one-shot import). So this spec creates a bare project (`POST /projects`),
 * uploads both fixtures, builds the function's root node tree with the real ids already spliced in,
 * and creates the document directly (`POST /projects/:id/documents`) rather than importing it.
 */
describe('integrations (workflow tier): Media — probe/resize/thumbnail/audio-extract', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();

    // oxlint-disable-next-line init-declarations -- assigned inside the try block below.
    let health: Response;
    try {
      health = await fetch(`${WORKFLOW_E2E_MEDIA_URL}/health`);
    } catch (error) {
      throw new Error(
        `media service not reachable at ${WORKFLOW_E2E_MEDIA_URL} — is docker-compose.workflow-e2e.yml's "media" ` +
          `service running (ADR 0041 (private))? ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    const body = (await health.json().catch(() => ({}))) as { ok?: boolean };
    if (!health.ok || body.ok !== true) {
      throw new Error(
        `media service /health at ${WORKFLOW_E2E_MEDIA_URL} did not report { ok: true } (status ${health.status})`,
      );
    }
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  const createProject = async (name: string): Promise<string> => {
    const response = await workflowE2eApi().post('/projects').set(workflowE2eAuth(token)).send({ name });
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  /** Raw project-API upload (`POST /projects/:id/files`, JWT-guarded) — see `project-files.controller.ts`; the body is the file's own bytes, never multipart/JSON-wrapped (`upload-request.ts`). */
  const uploadFile = async (projectId: string, name: string, mime: string, bytes: Buffer): Promise<string> => {
    const response = await workflowE2eApi()
      .post(`/projects/${projectId}/files`)
      .set(workflowE2eAuth(token))
      .set('content-type', mime)
      .set('x-file-name', name)
      .send(bytes);
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  };

  const createFunctionDocument = async (projectId: string, name: string, root: INode): Promise<void> => {
    const response = await workflowE2eApi()
      .post(`/projects/${projectId}/documents`)
      .set(workflowE2eAuth(token))
      .send({ id: randomUUID(), type: 'function', name, root });
    expect(response.status).toBe(201);
  };

  it('files-info -> media-probe/media-image-resize/media-video-thumbnail/media-audio-extract: a real ffmpeg round trip', async () => {
    const pngBytes = readFileSync(join(FIXTURES_DIR, 'sample.png'));
    const mp4Bytes = readFileSync(join(FIXTURES_DIR, 'sample.mp4'));

    const projectId = await createProject(`Workflow-tier Media ${Date.now()}`);
    try {
      const pngFileId = await uploadFile(projectId, 'sample.png', 'image/png', pngBytes);
      const mp4FileId = await uploadFile(projectId, 'sample.mp4', 'video/mp4', mp4Bytes);

      const root = buildFunctionNode(
        'fn',
        [
          // `fileId` is `kind: 'expression'`/`expectedType: string` — a quoted TS string literal,
          // not the bare id.
          buildFilesInfoNode('fn-png-info', { fileId: JSON.stringify(pngFileId), resultVariable: 'png' }),
          buildFilesInfoNode('fn-mp4-info', { fileId: JSON.stringify(mp4FileId), resultVariable: 'mp4' }),
          buildMediaProbeNode('fn-probe-png', { file: 'png', resultVariable: 'info' }),
          buildMediaImageResizeNode('fn-resize', {
            file: 'png',
            width: '32',
            format: 'webp',
            resultVariable: 'resized',
          }),
          buildMediaProbeNode('fn-probe-resized', { file: 'resized', resultVariable: 'resizedInfo' }),
          buildMediaVideoThumbnailNode('fn-thumb', { file: 'mp4', at: '0.5', width: '64', resultVariable: 'thumb' }),
          buildMediaAudioExtractNode('fn-audio', { file: 'mp4', format: 'mp3', resultVariable: 'audio' }),
          buildMediaProbeNode('fn-probe-audio', { file: 'audio', resultVariable: 'audioInfo' }),
          buildReturnNode('fn-return', '{ info, resizedInfo, resized, thumb, audioInfo }'),
        ],
        { type: 'any' },
      );

      await createFunctionDocument(projectId, 'mediaPipeline', root);

      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      const result = (await workflowE2eStartAndAwaitResult('mediaPipeline', `workflow-dev-${projectId}`)) as {
        info: IMediaInfoResult;
        resizedInfo: IMediaInfoResult;
        resized: IFileRefResult;
        thumb: IFileRefResult;
        audioInfo: IMediaInfoResult;
      };

      expect(result.info.width).toBe(64);
      expect(result.info.height).toBe(64);

      expect(result.resizedInfo.width).toBe(32);
      expect(result.resized.mime).toBe('image/webp');

      expect(result.thumb.mime).toBe('image/jpeg');

      expect(result.audioInfo.audioCodec).toContain('mp3');
      expect(result.audioInfo.duration).toBeGreaterThan(0.7);
      expect(result.audioInfo.duration).toBeLessThan(1.3);

      const filesList = await workflowE2eApi().get(`/projects/${projectId}/files`).set(workflowE2eAuth(token));
      expect(filesList.status).toBe(200);
      const filesBody = filesList.body as { files: readonly { createdBy: string }[] };
      expect(filesBody.files.some((file) => file.createdBy.startsWith('media:'))).toBe(true);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 180_000);

  // `media-video-transcode` is the only remaining catalog op with no workflow-tier coverage yet: a
  // real mid-transcode `DELETE /jobs/:jobId` race needs an input long enough that `ffmpeg` is still
  // running by the time the cancel request lands — this spec's 1-second `sample.mp4` transcodes
  // (even to `web-1080p`) faster than a round trip to submit-then-cancel can reliably observe. Needs
  // a longer (several-second) video fixture to drive for real; see `buildMediaVideoTranscodeNode` in
  // `workflow-e2e-fixtures-media.ts`, already shaped for whenever that fixture lands.
  it.todo('media-video-transcode: cancel mid-transcode deletes the job (needs a longer fixture)');
});
