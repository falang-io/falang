import type { IActionDescriptor, IFieldSelectOption } from '@falang/workflow-integrations-common';
import { fileArrayTypeInfo, fileTypeInfo } from '@falang/workflow-integrations-files';
import { BOOLEAN_OPTIONS, emitCall, MEDIA_ACTIVITY_OPTIONS } from './actions-shared.js';
import {
  FILE_REF_TYPE,
  MEDIA_VIDEO_CONCAT_ACTION_NAME,
  MEDIA_VIDEO_THUMBNAIL_ACTION_NAME,
  MEDIA_VIDEO_TRANSCODE_ACTION_NAME,
  MEDIA_VIDEO_TRIM_ACTION_NAME,
  RESULT_VARIABLE_FIELD_NAME,
} from './constants.js';

/** `media-video-trim`, `media-video-concat`, `media-video-thumbnail`, `media-video-transcode` — ADR 0041 (private) §2. */

const TRANSCODE_PRESET_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'web-720p', label: 'Web (720p)' },
  { value: 'web-1080p', label: 'Web (1080p)' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'gif', label: 'GIF' },
];

const TRANSCODE_FORMAT_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
  { value: 'gif', label: 'GIF' },
];

const mediaVideoTrimAction: IActionDescriptor = {
  name: MEDIA_VIDEO_TRIM_ACTION_NAME,
  label: 'media:action.videoTrim',
  editorType: 'sidebar',
  fields: [
    { name: 'file', label: 'media:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'start', label: 'media:field.start', kind: 'text' },
    { name: 'duration', label: 'media:field.duration', kind: 'text' },
    { name: 'reencode', label: 'media:field.reencode', kind: 'select', options: BOOLEAN_OPTIONS },
    { name: RESULT_VARIABLE_FIELD_NAME, label: 'media:field.result', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(
      `await mediaVideoTrim(${fields.file}, ${fields.start}, ${fields.duration}, ${fields.reencode})`,
      fields[RESULT_VARIABLE_FIELD_NAME],
    ),
  activitySignature: `mediaVideoTrim(file: ${FILE_REF_TYPE}, start: string, duration: string, reencode: string): Promise<${FILE_REF_TYPE}>`,
  activityCode: [
    'export const mediaVideoTrim = async (',
    '  file: IFileRef,',
    '  start: string,',
    '  duration: string,',
    '  reencode: string,',
    '): Promise<IFileRef> => {',
    "  const params: Record<string, unknown> = { start: Number(start || '0'), reencode: reencode === 'true' };",
    '  if (duration) params.duration = Number(duration);',
    "  const result = await runMediaJob('media-video-trim', [file], params, {",
    '    heartbeat,',
    '    cancellationSignal: cancellationSignal(),',
    '    jobKey: mediaJobKey(),',
    '    workflowEnv: process.env.WORKFLOW_ENV,',
    '  });',
    '  return result as IFileRef;',
    '};',
  ].join('\n'),
  activityOptions: MEDIA_ACTIVITY_OPTIONS,
  resultType: fileTypeInfo(),
};

const mediaVideoConcatAction: IActionDescriptor = {
  name: MEDIA_VIDEO_CONCAT_ACTION_NAME,
  label: 'media:action.videoConcat',
  editorType: 'sidebar',
  fields: [
    { name: 'files', label: 'media:field.files', kind: 'expression', expectedType: fileArrayTypeInfo() },
    { name: 'reencode', label: 'media:field.reencode', kind: 'select', options: BOOLEAN_OPTIONS },
    { name: RESULT_VARIABLE_FIELD_NAME, label: 'media:field.result', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(`await mediaVideoConcat(${fields.files}, ${fields.reencode})`, fields[RESULT_VARIABLE_FIELD_NAME]),
  activitySignature: `mediaVideoConcat(files: readonly ${FILE_REF_TYPE}[], reencode: string): Promise<${FILE_REF_TYPE}>`,
  activityCode: [
    'export const mediaVideoConcat = async (',
    '  files: readonly IFileRef[],',
    '  reencode: string,',
    '): Promise<IFileRef> => {',
    "  const params: Record<string, unknown> = { reencode: reencode === 'true' };",
    "  const result = await runMediaJob('media-video-concat', files, params, {",
    '    heartbeat,',
    '    cancellationSignal: cancellationSignal(),',
    '    jobKey: mediaJobKey(),',
    '    workflowEnv: process.env.WORKFLOW_ENV,',
    '  });',
    '  return result as IFileRef;',
    '};',
  ].join('\n'),
  activityOptions: MEDIA_ACTIVITY_OPTIONS,
  resultType: fileTypeInfo(),
};

const mediaVideoThumbnailAction: IActionDescriptor = {
  name: MEDIA_VIDEO_THUMBNAIL_ACTION_NAME,
  label: 'media:action.videoThumbnail',
  editorType: 'sidebar',
  fields: [
    { name: 'file', label: 'media:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'at', label: 'media:field.at', kind: 'text' },
    { name: 'width', label: 'media:field.width', kind: 'text' },
    { name: RESULT_VARIABLE_FIELD_NAME, label: 'media:field.result', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(
      `await mediaVideoThumbnail(${fields.file}, ${fields.at}, ${fields.width})`,
      fields[RESULT_VARIABLE_FIELD_NAME],
    ),
  activitySignature: `mediaVideoThumbnail(file: ${FILE_REF_TYPE}, at: string, width: string): Promise<${FILE_REF_TYPE}>`,
  activityCode: [
    'export const mediaVideoThumbnail = async (',
    '  file: IFileRef,',
    '  at: string,',
    '  width: string,',
    '): Promise<IFileRef> => {',
    "  const params: Record<string, unknown> = { at: Number(at || '0') };",
    '  if (width) params.width = Number(width);',
    "  const result = await runMediaJob('media-video-thumbnail', [file], params, {",
    '    heartbeat,',
    '    cancellationSignal: cancellationSignal(),',
    '    jobKey: mediaJobKey(),',
    '    workflowEnv: process.env.WORKFLOW_ENV,',
    '  });',
    '  return result as IFileRef;',
    '};',
  ].join('\n'),
  activityOptions: MEDIA_ACTIVITY_OPTIONS,
  resultType: fileTypeInfo(),
};

const mediaVideoTranscodeAction: IActionDescriptor = {
  name: MEDIA_VIDEO_TRANSCODE_ACTION_NAME,
  label: 'media:action.videoTranscode',
  editorType: 'sidebar',
  fields: [
    { name: 'file', label: 'media:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'preset', label: 'media:field.preset', kind: 'select', options: TRANSCODE_PRESET_OPTIONS },
    { name: 'format', label: 'media:field.videoFormat', kind: 'select', options: TRANSCODE_FORMAT_OPTIONS },
    { name: RESULT_VARIABLE_FIELD_NAME, label: 'media:field.result', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(
      `await mediaVideoTranscode(${fields.file}, ${fields.preset}, ${fields.format})`,
      fields[RESULT_VARIABLE_FIELD_NAME],
    ),
  activitySignature: `mediaVideoTranscode(file: ${FILE_REF_TYPE}, preset: string, format: string): Promise<${FILE_REF_TYPE}>`,
  activityCode: [
    'export const mediaVideoTranscode = async (',
    '  file: IFileRef,',
    '  preset: string,',
    '  format: string,',
    '): Promise<IFileRef> => {',
    "  const params: Record<string, unknown> = { preset, format: format || 'mp4' };",
    "  const result = await runMediaJob('media-video-transcode', [file], params, {",
    '    heartbeat,',
    '    cancellationSignal: cancellationSignal(),',
    '    jobKey: mediaJobKey(),',
    '    workflowEnv: process.env.WORKFLOW_ENV,',
    '  });',
    '  return result as IFileRef;',
    '};',
  ].join('\n'),
  activityOptions: MEDIA_ACTIVITY_OPTIONS,
  resultType: fileTypeInfo(),
};

export const mediaVideoActions: readonly IActionDescriptor[] = [
  mediaVideoTrimAction,
  mediaVideoConcatAction,
  mediaVideoThumbnailAction,
  mediaVideoTranscodeAction,
];
