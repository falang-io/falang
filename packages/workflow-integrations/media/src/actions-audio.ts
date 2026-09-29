import type { IActionDescriptor, IFieldSelectOption } from '@falang/workflow-integrations-common';
import { fileTypeInfo } from '@falang/workflow-integrations-files';
import { BOOLEAN_OPTIONS, emitCall, MEDIA_ACTIVITY_OPTIONS } from './actions-shared.js';
import {
  FILE_REF_TYPE,
  MEDIA_AUDIO_CONVERT_ACTION_NAME,
  MEDIA_AUDIO_EXTRACT_ACTION_NAME,
  RESULT_VARIABLE_FIELD_NAME,
} from './constants.js';

/** `media-audio-extract`, `media-audio-convert` — ADR 0041 (private) §2. */

const AUDIO_FORMAT_OPTIONS: readonly IFieldSelectOption[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'aac', label: 'AAC' },
  { value: 'wav', label: 'WAV' },
  { value: 'ogg', label: 'OGG' },
];

const BITRATE_OPTIONS: readonly IFieldSelectOption[] = [
  { value: '', label: 'Default' },
  { value: '64k', label: '64k' },
  { value: '96k', label: '96k' },
  { value: '128k', label: '128k' },
  { value: '192k', label: '192k' },
  { value: '256k', label: '256k' },
];

const SAMPLE_RATE_OPTIONS: readonly IFieldSelectOption[] = [
  { value: '', label: 'Default' },
  { value: '8000', label: '8000 Hz' },
  { value: '16000', label: '16000 Hz' },
  { value: '22050', label: '22050 Hz' },
  { value: '44100', label: '44100 Hz' },
  { value: '48000', label: '48000 Hz' },
];

const mediaAudioExtractAction: IActionDescriptor = {
  name: MEDIA_AUDIO_EXTRACT_ACTION_NAME,
  label: 'media:action.audioExtract',
  editorType: 'sidebar',
  fields: [
    { name: 'file', label: 'media:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'format', label: 'media:field.audioFormat', kind: 'select', options: AUDIO_FORMAT_OPTIONS },
    { name: RESULT_VARIABLE_FIELD_NAME, label: 'media:field.result', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(`await mediaAudioExtract(${fields.file}, ${fields.format})`, fields[RESULT_VARIABLE_FIELD_NAME]),
  activitySignature: `mediaAudioExtract(file: ${FILE_REF_TYPE}, format: string): Promise<${FILE_REF_TYPE}>`,
  activityCode: [
    'export const mediaAudioExtract = async (',
    '  file: IFileRef,',
    '  format: string,',
    '): Promise<IFileRef> => {',
    "  const params: Record<string, unknown> = { format: format || 'mp3' };",
    "  const result = await runMediaJob('media-audio-extract', [file], params, {",
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

const mediaAudioConvertAction: IActionDescriptor = {
  name: MEDIA_AUDIO_CONVERT_ACTION_NAME,
  label: 'media:action.audioConvert',
  editorType: 'sidebar',
  fields: [
    { name: 'file', label: 'media:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'format', label: 'media:field.audioFormat', kind: 'select', options: AUDIO_FORMAT_OPTIONS },
    { name: 'bitrate', label: 'media:field.bitrate', kind: 'select', options: BITRATE_OPTIONS },
    { name: 'mono', label: 'media:field.mono', kind: 'select', options: BOOLEAN_OPTIONS },
    { name: 'sampleRate', label: 'media:field.sampleRate', kind: 'select', options: SAMPLE_RATE_OPTIONS },
    { name: RESULT_VARIABLE_FIELD_NAME, label: 'media:field.result', kind: 'new-variable' },
  ],
  emit: (fields) =>
    emitCall(
      `await mediaAudioConvert(${fields.file}, ${fields.format}, ${fields.bitrate}, ${fields.mono}, ${fields.sampleRate})`,
      fields[RESULT_VARIABLE_FIELD_NAME],
    ),
  activitySignature: `mediaAudioConvert(file: ${FILE_REF_TYPE}, format: string, bitrate: string, mono: string, sampleRate: string): Promise<${FILE_REF_TYPE}>`,
  activityCode: [
    'export const mediaAudioConvert = async (',
    '  file: IFileRef,',
    '  format: string,',
    '  bitrate: string,',
    '  mono: string,',
    '  sampleRate: string,',
    '): Promise<IFileRef> => {',
    "  const params: Record<string, unknown> = { format: format || 'mp3', mono: mono === 'true' };",
    '  if (bitrate) params.bitrate = bitrate;',
    '  if (sampleRate) params.sampleRate = Number(sampleRate);',
    "  const result = await runMediaJob('media-audio-convert', [file], params, {",
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

export const mediaAudioActions: readonly IActionDescriptor[] = [mediaAudioExtractAction, mediaAudioConvertAction];
