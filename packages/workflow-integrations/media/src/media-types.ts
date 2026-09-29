import type { TVariableInfo } from '@falang/typescript-dto';
import type { IIntegrationStructType } from '@falang/workflow-integrations-common';
import { MEDIA_INFO_TYPE_ID } from './constants.js';

/**
 * `media-probe`'s result shape (ADR 0041 (private) §2) — `ffprobe`'s own
 * `-show_streams -show_format` output, reduced to the handful of fields a workflow actually branches
 * on. Never the bytes themselves, same "reference/summary, not raw data" posture as `files/File`.
 */
export interface IMediaInfo {
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly bitrate: number;
  readonly mime: string;
}

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/**
 * Registered into the editor's `TypesRegistryStore` via `IWorkflowIntegration.types`, the same way
 * `@falang/workflow-integrations-files`'s `filesFileType` is — so `media-probe`'s `resultType`
 * (`mediaInfoTypeInfo()`) resolves/autocompletes against it.
 */
export const mediaInfoType: IIntegrationStructType = {
  id: MEDIA_INFO_TYPE_ID,
  name: 'MediaInfo',
  properties: {
    duration: anyNumber,
    width: anyNumber,
    height: anyNumber,
    videoCodec: { type: 'string' },
    audioCodec: { type: 'string' },
    bitrate: anyNumber,
    mime: { type: 'string' },
  },
};

/** `{ type: 'struct', id: 'media/MediaInfo' }` — the `resultType` `media-probe` uses. */
export const mediaInfoTypeInfo = (): TVariableInfo => ({ type: 'struct', id: MEDIA_INFO_TYPE_ID });
