import type { IActionDescriptor, IFieldSelectOption } from '@falang/workflow-integrations-common';
import { fileTypeInfo } from '@falang/workflow-integrations-files';
import { emitCall, MEDIA_ACTIVITY_OPTIONS } from './actions-shared.js';
import {
  FILE_REF_TYPE,
  MEDIA_IMAGE_CONVERT_ACTION_NAME,
  MEDIA_IMAGE_RESIZE_ACTION_NAME,
  MEDIA_INFO_TYPE_LITERAL,
  MEDIA_PROBE_ACTION_NAME,
  RESULT_VARIABLE_FIELD_NAME,
} from './constants.js';
import { mediaInfoTypeInfo } from './media-types.js';

/** `media-probe`, `media-image-resize`, `media-image-convert` — ADR 0041 (private) §2. Split out of `actions.ts` to keep every file under the repo's `max-lines` budget. */

const FIT_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'contain', label: 'Contain (fit inside)' },
  { value: 'cover', label: 'Cover (crop to fill)' },
];

const IMAGE_FORMAT_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'keep', label: 'Keep original' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
];

const IMAGE_CONVERT_FORMAT_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
];

const mediaProbeAction: IActionDescriptor = {
  name: MEDIA_PROBE_ACTION_NAME,
  label: 'media:action.probe',
  editorType: 'sidebar',
  fields: [
    { name: 'file', label: 'media:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: RESULT_VARIABLE_FIELD_NAME, label: 'media:field.result', kind: 'new-variable' },
  ],
  emit: (fields) => emitCall(`await mediaProbe(${fields.file})`, fields[RESULT_VARIABLE_FIELD_NAME]),
  activitySignature: `mediaProbe(file: ${FILE_REF_TYPE}): Promise<${MEDIA_INFO_TYPE_LITERAL}>`,
  activityCode: [
    'export const mediaProbe = async (',
    '  file: IFileRef,',
    `): Promise<${MEDIA_INFO_TYPE_LITERAL}> => {`,
    "  const result = await runMediaJob('media-probe', [file], {}, {",
    '    heartbeat,',
    '    cancellationSignal: cancellationSignal(),',
    '    jobKey: mediaJobKey(),',
    '    workflowEnv: process.env.WORKFLOW_ENV,',
    '  });',
    `  return result as ${MEDIA_INFO_TYPE_LITERAL};`,
    '};',
  ].join('\n'),
  activityOptions: MEDIA_ACTIVITY_OPTIONS,
  resultType: mediaInfoTypeInfo(),
};

const mediaImageResizeAction: IActionDescriptor = {
  name: MEDIA_IMAGE_RESIZE_ACTION_NAME,
  label: 'media:action.imageResize',
  editorType: 'sidebar',
  fields: [
    { name: 'file', label: 'media:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'width', label: 'media:field.width', kind: 'text' },
    { name: 'height', label: 'media:field.height', kind: 'text' },
    { name: 'fit', label: 'media:field.fit', kind: 'select', options: FIT_OPTIONS },
    { name: 'format', label: 'media:field.imageFormat', kind: 'select', options: IMAGE_FORMAT_OPTIONS },
    { name: 'quality', label: 'media:field.quality', kind: 'text' },
    { name: RESULT_VARIABLE_FIELD_NAME, label: 'media:field.result', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(
      `await mediaImageResize(${fields.file}, ${fields.width}, ${fields.height}, ${fields.fit}, ${fields.format}, ${fields.quality})`,
      fields[RESULT_VARIABLE_FIELD_NAME],
    ),
  activitySignature: `mediaImageResize(file: ${FILE_REF_TYPE}, width: string, height: string, fit: string, format: string, quality: string): Promise<${FILE_REF_TYPE}>`,
  activityCode: [
    'export const mediaImageResize = async (',
    '  file: IFileRef,',
    '  width: string,',
    '  height: string,',
    '  fit: string,',
    '  format: string,',
    '  quality: string,',
    '): Promise<IFileRef> => {',
    '  const params: Record<string, unknown> = {',
    "    fit: fit || 'contain',",
    "    format: format || 'keep',",
    '    quality: quality ? Number(quality) : 85,',
    '  };',
    '  if (width) params.width = Number(width);',
    '  if (height) params.height = Number(height);',
    "  const result = await runMediaJob('media-image-resize', [file], params, {",
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

const mediaImageConvertAction: IActionDescriptor = {
  name: MEDIA_IMAGE_CONVERT_ACTION_NAME,
  label: 'media:action.imageConvert',
  editorType: 'sidebar',
  fields: [
    { name: 'file', label: 'media:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'format', label: 'media:field.imageFormat', kind: 'select', options: IMAGE_CONVERT_FORMAT_OPTIONS },
    { name: 'quality', label: 'media:field.quality', kind: 'text' },
    { name: RESULT_VARIABLE_FIELD_NAME, label: 'media:field.result', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(
      `await mediaImageConvert(${fields.file}, ${fields.format}, ${fields.quality})`,
      fields[RESULT_VARIABLE_FIELD_NAME],
    ),
  activitySignature: `mediaImageConvert(file: ${FILE_REF_TYPE}, format: string, quality: string): Promise<${FILE_REF_TYPE}>`,
  activityCode: [
    'export const mediaImageConvert = async (',
    '  file: IFileRef,',
    '  format: string,',
    '  quality: string,',
    '): Promise<IFileRef> => {',
    '  const params: Record<string, unknown> = { format, quality: quality ? Number(quality) : 85 };',
    "  const result = await runMediaJob('media-image-convert', [file], params, {",
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

export const mediaImageActions: readonly IActionDescriptor[] = [
  mediaProbeAction,
  mediaImageResizeAction,
  mediaImageConvertAction,
];
