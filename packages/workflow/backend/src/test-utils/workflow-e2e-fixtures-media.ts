import type { INode } from '@falang/dto';

/**
 * Node builders for `integrations-media.workflow-e2e-spec.ts` (ADR 0041 (private) §2/§5) — field names/shapes mirror `@falang/workflow-integrations-media`'s own
 * `actions-image.ts`/`actions-video.ts`/`actions-audio.ts` exactly, reimplemented here rather than
 * imported across the package boundary, the same reason `workflow-e2e-fixtures-files.ts` gives for
 * its own `files-*` builders. Split into its own file (rather than added to
 * `workflow-e2e-fixtures-files.ts`/`workflow-e2e-fixtures.ts`, both owned by concurrent work this
 * session must not touch) to stay under this repo's 300-line-per-file lint cap (see CLAUDE.md's
 * "Conventions").
 *
 * Also carries `buildFilesInfoNode` (`@falang/workflow-integrations-files`'s `files-info` action) —
 * every media op takes/returns a `files/File` reference, never raw bytes, so a fixture needs a way
 * to turn a project-API-uploaded file's plain `fileId` string into an in-scope `File` variable
 * before it can feed a `media-*` node's `file`/`files` field.
 */

interface IFilesInfoFields {
  /** Raw expression code, `expectedType: string` — pass a quoted literal, e.g. `'"<fileId>"'`. */
  readonly fileId: string;
  readonly resultVariable: string;
}

/** `files-info` node (`@falang/workflow-integrations-files`). */
export const buildFilesInfoNode = (id: string, fields: IFilesInfoFields): INode => ({
  id,
  name: 'files-info',
  data: { fileId: fields.fileId, resultVariable: fields.resultVariable },
});

interface IMediaProbeFields {
  /** Raw expression code, `expectedType: files/File`. */
  readonly file: string;
  readonly resultVariable: string;
}

/** `media-probe` node — returns `media/MediaInfo` (`{ duration, width, height, videoCodec, audioCodec, bitrate, mime }`). */
export const buildMediaProbeNode = (id: string, fields: IMediaProbeFields): INode => ({
  id,
  name: 'media-probe',
  data: { file: fields.file, resultVariable: fields.resultVariable },
});

interface IMediaImageResizeFields {
  /** Raw expression code, `expectedType: files/File`. */
  readonly file: string;
  /** Plain text field (not an expression) — a literal integer as a string, e.g. `'32'`. */
  readonly width?: string;
  readonly height?: string;
  /** `select` field: `'contain'` (default) | `'cover'`. */
  readonly fit?: string;
  /** `select` field: `'keep'` (default) | `'jpeg'` | `'png'` | `'webp'`. */
  readonly format?: string;
  /** Plain text field — a literal integer 1..100 as a string, blank for the default (85). */
  readonly quality?: string;
  readonly resultVariable: string;
}

/** `media-image-resize` node — returns a `files/File`. */
export const buildMediaImageResizeNode = (id: string, fields: IMediaImageResizeFields): INode => ({
  id,
  name: 'media-image-resize',
  data: {
    file: fields.file,
    width: fields.width ?? '',
    height: fields.height ?? '',
    fit: fields.fit ?? '',
    format: fields.format ?? '',
    quality: fields.quality ?? '',
    resultVariable: fields.resultVariable,
  },
});

interface IMediaVideoThumbnailFields {
  /** Raw expression code, `expectedType: files/File`. */
  readonly file: string;
  /** Plain text field — seconds as a string, e.g. `'0.5'`. */
  readonly at?: string;
  readonly width?: string;
  readonly resultVariable: string;
}

/** `media-video-thumbnail` node — returns a `files/File` (jpeg). */
export const buildMediaVideoThumbnailNode = (id: string, fields: IMediaVideoThumbnailFields): INode => ({
  id,
  name: 'media-video-thumbnail',
  data: { file: fields.file, at: fields.at ?? '', width: fields.width ?? '', resultVariable: fields.resultVariable },
});

interface IMediaAudioExtractFields {
  /** Raw expression code, `expectedType: files/File`. */
  readonly file: string;
  /** `select` field: `'mp3'` (default) | `'aac'` | `'wav'` | `'ogg'`. */
  readonly format?: string;
  readonly resultVariable: string;
}

/** `media-audio-extract` node — returns a `files/File`. */
export const buildMediaAudioExtractNode = (id: string, fields: IMediaAudioExtractFields): INode => ({
  id,
  name: 'media-audio-extract',
  data: { file: fields.file, format: fields.format ?? '', resultVariable: fields.resultVariable },
});

interface IMediaVideoTranscodeFields {
  /** Raw expression code, `expectedType: files/File`. */
  readonly file: string;
  /** `select` field: `'web-720p'` | `'web-1080p'` | `'telegram'` | `'gif'`. */
  readonly preset: string;
  /** `select` field: `'mp4'` (default) | `'webm'` | `'gif'`. */
  readonly format?: string;
  readonly resultVariable: string;
}

/**
 * `media-video-transcode` node — not exercised yet (`it.todo`, see the spec's cancel case: this
 * repo's 1-second fixture video transcodes too fast for a real mid-job `DELETE /jobs/:jobId` race),
 * but kept here so that follow-up doesn't need to reconstruct the field shape from scratch.
 */
export const buildMediaVideoTranscodeNode = (id: string, fields: IMediaVideoTranscodeFields): INode => ({
  id,
  name: 'media-video-transcode',
  data: {
    file: fields.file,
    preset: fields.preset,
    format: fields.format ?? '',
    resultVariable: fields.resultVariable,
  },
});
