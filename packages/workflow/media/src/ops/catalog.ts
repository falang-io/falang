import type { TMediaOp } from '../types.js';
import { audioConvertOp } from './audio-convert.js';
import { audioExtractOp } from './audio-extract.js';
import { imageConvertOp } from './image-convert.js';
import { imageResizeOp } from './image-resize.js';
import { mediaProbeOp } from './media-probe-op.js';
import type { IMediaOpDefinition } from './types.js';
import { videoConcatOp } from './video-concat.js';
import { videoThumbnailOp } from './video-thumbnail.js';
import { videoTranscodeOp } from './video-transcode.js';
import { videoTrimOp } from './video-trim.js';

/** The whole surface, ADR 0041 (private) §2 — no escape hatch, no
 * free-form op (see the ADR's "Decisions (2026-09-28)" §1). */
export const MEDIA_OPS: Readonly<Record<TMediaOp, IMediaOpDefinition>> = {
  'media-probe': mediaProbeOp,
  'media-image-resize': imageResizeOp,
  'media-image-convert': imageConvertOp,
  'media-video-trim': videoTrimOp,
  'media-video-concat': videoConcatOp,
  'media-video-thumbnail': videoThumbnailOp,
  'media-video-transcode': videoTranscodeOp,
  'media-audio-extract': audioExtractOp,
  'media-audio-convert': audioConvertOp,
};

/** Feeds `<basename>.<suffix>.<ext>` output naming (ADR §1 — `photo.jpg` → `photo.resized.webp`). */
export const OP_SUFFIX: Readonly<Record<TMediaOp, string>> = {
  'media-probe': 'probe',
  'media-image-resize': 'resized',
  'media-image-convert': 'converted',
  'media-video-trim': 'trimmed',
  'media-video-concat': 'concat',
  'media-video-thumbnail': 'thumbnail',
  'media-video-transcode': 'transcoded',
  'media-audio-extract': 'audio',
  'media-audio-convert': 'converted',
};

export const isMediaOp = (value: string): value is TMediaOp => Object.hasOwn(MEDIA_OPS, value);
