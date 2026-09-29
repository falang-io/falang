import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor, IActivityOptions } from '@falang/workflow-integrations-common';
import {
  FILES_DELETE_ACTION_NAME,
  FILES_DOWNLOAD_ACTION_NAME,
  FILES_FROM_TEXT_ACTION_NAME,
  FILES_INFO_ACTION_NAME,
  FILES_PUBLISH_ACTION_NAME,
  FILES_READ_TEXT_ACTION_NAME,
  FILES_UNPUBLISH_ACTION_NAME,
  RESULT_VARIABLE_FIELD_NAME,
} from './constants.js';
import { fileTypeInfo } from './file-types.js';

const anyType: TVariableInfo = { type: 'any' };

/**
 * `activitySignature`'s literal text is spliced verbatim into `workflows.ts`'s own
 * `proxyActivities<{...}>()` type literal (see `@falang/workflow-compiler`'s
 * `activity-proxy-groups.ts`) — a *different* generated file from `activities.ts`, which is the only
 * one `sharedActivityCode` imports `IFileRef` into. A bare `IFileRef` here would type-check inside
 * `activities.ts`'s own `activityCode` (which does have the import) but fail as an unresolved name in
 * `workflows.ts` — every other vendor's `activitySignature` already avoids this by never naming an
 * external type (e.g. Telegram's `Promise<{ messageId: string }>`), so this inlines the same shape
 * `IFileRef` declares instead of importing it.
 */
const FILE_REF_TYPE = '{ id: string; name: string; size: number; mime: string; publicUrl?: string }';

/** Streaming download/upload — a 50 MB+ file doesn't fit the default 10s local-activity timeout (ADR 0038 (private) §3). */
const STREAMING_ACTIVITY_OPTIONS: IActivityOptions = {
  kind: 'regular',
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '1 minute',
};

/** Everything else here is one small internal-API call — still routed (`kind: 'regular'`) rather than a local activity, since it's real I/O to `backend`, just not one that needs a long timeout or a heartbeat. */
const QUICK_ACTIVITY_OPTIONS: IActivityOptions = { kind: 'regular', startToCloseTimeout: '1 minute' };

const emitCall = (call: string, resultVariable: string): string =>
  resultVariable ? `const ${resultVariable} = ${call};` : `${call};`;

export const filesActions: readonly IActionDescriptor[] = [
  {
    name: FILES_DOWNLOAD_ACTION_NAME,
    label: 'files:action.download',
    editorType: 'sidebar',
    fields: [
      { name: 'url', label: 'files:field.url', kind: 'template-string' },
      { name: 'headers', label: 'files:field.headers', kind: 'expression', expectedType: anyType },
      { name: 'name', label: 'files:field.name', kind: 'template-string' },
      { name: 'ttlHours', label: 'files:field.ttlHours', kind: 'text' },
      { name: RESULT_VARIABLE_FIELD_NAME, label: 'files:field.result', kind: 'new-variable' },
    ],
    emit: (fields) => {
      const headers = fields.headers || 'undefined';
      const call = `await filesDownload(${fields.url}, ${headers}, ${fields.name}, ${fields.ttlHours})`;
      return emitCall(call, fields[RESULT_VARIABLE_FIELD_NAME]);
    },
    activitySignature: `filesDownload(url: string, headers: Record<string, string> | undefined, name: string, ttlHours: string): Promise<${FILE_REF_TYPE}>`,
    // TS source emitted verbatim into activities.ts — see `sharedActivityCode` below for the
    // `uploadFileFromStream`/`heartbeat` imports this (and the two actions after it) rely on.
    activityCode: [
      'export const filesDownload = async (',
      '  url: string,',
      '  headers: Record<string, string> | undefined,',
      '  name: string,',
      '  ttlHours: string,',
      '): Promise<IFileRef> => {',
      '  heartbeat();',
      '  const response = await fetch(url, { headers });',
      '  if (!response.ok) {',
      '    throw new Error(`files-download: failed to fetch ${url}: ${response.status} ${await response.text()}`);',
      '  }',
      '  if (!response.body) throw new Error(`files-download: no response body for ${url}`);',
      "  const mime = response.headers.get('content-type') ?? 'application/octet-stream';",
      "  const fallbackName = url.split('/').pop()?.split('?')[0] || 'file';",
      '  const ttlSeconds = ttlHours ? Number(ttlHours) * 3600 : undefined;',
      '  return uploadFileFromStream(response.body, { name: name || fallbackName, mime, ttlSeconds });',
      '};',
    ].join('\n'),
    activityOptions: STREAMING_ACTIVITY_OPTIONS,
    resultType: fileTypeInfo(),
  },
  {
    name: FILES_FROM_TEXT_ACTION_NAME,
    label: 'files:action.fromText',
    editorType: 'sidebar',
    fields: [
      { name: 'text', label: 'files:field.text', kind: 'expression', expectedType: { type: 'string' } },
      { name: 'name', label: 'files:field.name', kind: 'template-string' },
      { name: 'mime', label: 'files:field.mime', kind: 'text' },
      { name: 'ttlHours', label: 'files:field.ttlHours', kind: 'text' },
      { name: RESULT_VARIABLE_FIELD_NAME, label: 'files:field.result', kind: 'new-variable' },
    ],
    emit: (fields) => {
      const call = `await filesFromText(${fields.text}, ${fields.name}, ${fields.mime}, ${fields.ttlHours})`;
      return emitCall(call, fields[RESULT_VARIABLE_FIELD_NAME]);
    },
    activitySignature: `filesFromText(text: string, name: string, mime: string, ttlHours: string): Promise<${FILE_REF_TYPE}>`,
    activityCode: [
      'export const filesFromText = async (',
      '  text: string,',
      '  name: string,',
      '  mime: string,',
      '  ttlHours: string,',
      '): Promise<IFileRef> => {',
      '  heartbeat();',
      "  const resolvedMime = mime || 'text/plain';",
      '  const bytes = new TextEncoder().encode(text);',
      '  const ttlSeconds = ttlHours ? Number(ttlHours) * 3600 : undefined;',
      "  return uploadFileFromStream(bytes, { name: name || 'file.txt', mime: resolvedMime, ttlSeconds });",
      '};',
    ].join('\n'),
    activityOptions: STREAMING_ACTIVITY_OPTIONS,
    resultType: fileTypeInfo(),
  },
  {
    name: FILES_READ_TEXT_ACTION_NAME,
    label: 'files:action.readText',
    editorType: 'sidebar',
    fields: [
      { name: 'file', label: 'files:field.file', kind: 'expression', expectedType: fileTypeInfo() },
      { name: 'maxBytes', label: 'files:field.maxBytes', kind: 'text' },
      { name: RESULT_VARIABLE_FIELD_NAME, label: 'files:field.result', kind: 'new-variable' },
    ],
    emit: (fields) => {
      const call = `await filesReadText(${fields.file}, ${fields.maxBytes})`;
      return emitCall(call, fields[RESULT_VARIABLE_FIELD_NAME]);
    },
    activitySignature: `filesReadText(file: ${FILE_REF_TYPE}, maxBytes: string): Promise<string>`,
    activityCode: [
      'export const filesReadText = async (file: IFileRef, maxBytes: string): Promise<string> => {',
      '  heartbeat();',
      '  const limit = maxBytes ? Number(maxBytes) : 1_048_576;',
      '  const bytes = await readFileBytes(file, limit);',
      '  return new TextDecoder().decode(bytes);',
      '};',
    ].join('\n'),
    activityOptions: STREAMING_ACTIVITY_OPTIONS,
    resultType: { type: 'string' },
  },
  {
    name: FILES_DELETE_ACTION_NAME,
    label: 'files:action.delete',
    fields: [{ name: 'file', label: 'files:field.file', kind: 'expression', expectedType: fileTypeInfo() }],
    emit: (fields) => `await filesDelete(${fields.file});`,
    activitySignature: `filesDelete(file: ${FILE_REF_TYPE}): Promise<void>`,
    activityCode: [
      'export const filesDelete = async (file: IFileRef): Promise<void> => {',
      '  await deleteFile(file);',
      '};',
    ].join('\n'),
    activityOptions: QUICK_ACTIVITY_OPTIONS,
  },
  {
    name: FILES_INFO_ACTION_NAME,
    label: 'files:action.info',
    fields: [
      { name: 'fileId', label: 'files:field.fileId', kind: 'expression', expectedType: { type: 'string' } },
      { name: RESULT_VARIABLE_FIELD_NAME, label: 'files:field.result', kind: 'new-variable' },
    ],
    emit: (fields) => emitCall(`await filesInfo(${fields.fileId})`, fields[RESULT_VARIABLE_FIELD_NAME]),
    activitySignature: `filesInfo(fileId: string): Promise<${FILE_REF_TYPE}>`,
    activityCode: [
      'export const filesInfo = async (fileId: string): Promise<IFileRef> => {',
      '  return getFileMeta(fileId);',
      '};',
    ].join('\n'),
    activityOptions: QUICK_ACTIVITY_OPTIONS,
    resultType: fileTypeInfo(),
  },
  {
    name: FILES_PUBLISH_ACTION_NAME,
    label: 'files:action.publish',
    fields: [
      { name: 'file', label: 'files:field.file', kind: 'expression', expectedType: fileTypeInfo() },
      { name: RESULT_VARIABLE_FIELD_NAME, label: 'files:field.result', kind: 'new-variable' },
    ],
    emit: (fields) => emitCall(`await filesPublish(${fields.file})`, fields[RESULT_VARIABLE_FIELD_NAME]),
    activitySignature: `filesPublish(file: ${FILE_REF_TYPE}): Promise<${FILE_REF_TYPE}>`,
    activityCode: [
      'export const filesPublish = async (file: IFileRef): Promise<IFileRef> => {',
      '  return publishFile(file);',
      '};',
    ].join('\n'),
    activityOptions: QUICK_ACTIVITY_OPTIONS,
    resultType: fileTypeInfo(),
  },
  {
    name: FILES_UNPUBLISH_ACTION_NAME,
    label: 'files:action.unpublish',
    fields: [
      { name: 'file', label: 'files:field.file', kind: 'expression', expectedType: fileTypeInfo() },
      { name: RESULT_VARIABLE_FIELD_NAME, label: 'files:field.result', kind: 'new-variable' },
    ],
    emit: (fields) => emitCall(`await filesUnpublish(${fields.file})`, fields[RESULT_VARIABLE_FIELD_NAME]),
    activitySignature: `filesUnpublish(file: ${FILE_REF_TYPE}): Promise<${FILE_REF_TYPE}>`,
    activityCode: [
      'export const filesUnpublish = async (file: IFileRef): Promise<IFileRef> => {',
      '  return unpublishFile(file);',
      '};',
    ].join('\n'),
    activityOptions: QUICK_ACTIVITY_OPTIONS,
    resultType: fileTypeInfo(),
  },
];
