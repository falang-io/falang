export const MEDIA_VENDOR = 'media';

/** `IIntegrationStructType.id` for `{ duration, width, height, videoCodec, audioCodec, bitrate, mime }` — see `media-types.ts`. */
export const MEDIA_INFO_TYPE_ID = 'media/MediaInfo';

export const MEDIA_PROBE_ACTION_NAME = 'media-probe';
export const MEDIA_IMAGE_RESIZE_ACTION_NAME = 'media-image-resize';
export const MEDIA_IMAGE_CONVERT_ACTION_NAME = 'media-image-convert';
export const MEDIA_VIDEO_TRIM_ACTION_NAME = 'media-video-trim';
export const MEDIA_VIDEO_CONCAT_ACTION_NAME = 'media-video-concat';
export const MEDIA_VIDEO_THUMBNAIL_ACTION_NAME = 'media-video-thumbnail';
export const MEDIA_VIDEO_TRANSCODE_ACTION_NAME = 'media-video-transcode';
export const MEDIA_AUDIO_EXTRACT_ACTION_NAME = 'media-audio-extract';
export const MEDIA_AUDIO_CONVERT_ACTION_NAME = 'media-audio-convert';

/** Shared across every action's `new-variable` result field (see `actions-*.ts`). */
export const RESULT_VARIABLE_FIELD_NAME = 'resultVariable';

/**
 * `activitySignature`'s literal text is spliced verbatim into `workflows.ts`'s own
 * `proxyActivities<{...}>()` type literal (see `@falang/workflow-compiler`'s
 * `activity-proxy-groups.ts`) — a *different* generated file from `activities.ts`, which is the only
 * one `sharedActivityCode` imports `IFileRef` into. A bare `IFileRef`/`IMediaInfo` here would
 * type-check inside `activities.ts`'s own `activityCode` (which does have the import) but fail as an
 * unresolved name in `workflows.ts` — every registered vendor's `activitySignature` already avoids
 * this by never naming an external type (see `@falang/workflow-integrations-files`'s own
 * `FILE_REF_TYPE`), so both constants below inline the same shapes `IFileRef`/`IMediaInfo` declare
 * instead of importing them.
 */
export const FILE_REF_TYPE = '{ id: string; name: string; size: number; mime: string; publicUrl?: string }';

export const MEDIA_INFO_TYPE_LITERAL =
  '{ duration: number; width: number; height: number; videoCodec: string; audioCodec: string; bitrate: number; mime: string }';
