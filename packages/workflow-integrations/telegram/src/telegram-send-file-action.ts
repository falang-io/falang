import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor } from '@falang/workflow-integrations-common';
import { fileTypeInfo } from '@falang/workflow-integrations-files';
import { TELEGRAM_SEND_FILE_NAME, TELEGRAM_VENDOR } from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/**
 * Same "inline the shape, don't import `IFileRef`" workaround `@falang/workflow-integrations-files`'s
 * own `actions.ts` documents on its own `FILE_REF_TYPE` const — `activitySignature`'s text is spliced
 * verbatim into `workflows.ts`'s `proxyActivities<{...}>()` type literal (a file that never imports
 * `@falang/workflow-integrations-files`), a different generated file from `activities.ts` (the only
 * one that gets the real `IFileRef` type import, via this action's own `activityCode`/
 * `sharedActivityCode` below).
 */
const FILE_REF_TYPE = '{ id: string; name: string; size: number; mime: string; publicUrl?: string }';

const AS_OPTIONS = [
  { value: 'auto', label: 'telegram:sendFileAs.auto' },
  { value: 'photo', label: 'telegram:sendFileAs.photo' },
  { value: 'document', label: 'telegram:sendFileAs.document' },
  { value: 'video', label: 'telegram:sendFileAs.video' },
  { value: 'audio', label: 'telegram:sendFileAs.audio' },
  { value: 'voice', label: 'telegram:sendFileAs.voice' },
];

/**
 * Sends a `files/File` to a chat as a real Telegram attachment (photo/document/video/audio/voice) —
 * see ADR 0038 (private) §5. Always multipart, never `publicUrl`: a
 * `BACKEND_PUBLIC_URL` reachable from Telegram's own servers isn't guaranteed in local dev/e2e, while
 * multipart works everywhere (same reasoning `openFileStream`'s doc comment gives for
 * `readFileBytes`-then-`Blob` over re-streaming).
 */
export const telegramSendFileAction: IActionDescriptor = {
  name: TELEGRAM_SEND_FILE_NAME,
  label: 'telegram:action.sendFile',
  fields: [
    { name: 'credentialId', label: 'telegram:field.bot', kind: 'credential-ref', vendor: TELEGRAM_VENDOR },
    { name: 'chatId', label: 'telegram:field.chatId', kind: 'expression', expectedType: anyNumber },
    { name: 'file', label: 'telegram:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'as', label: 'telegram:field.sendFileAs', kind: 'select', options: AS_OPTIONS },
    { name: 'caption', label: 'telegram:field.caption', kind: 'template-string' },
  ],
  emit: (fields) =>
    `await telegramSendFile(${fields.credentialId}, ${fields.chatId}, ${fields.file}, ${fields.as}, ${fields.caption});`,
  activitySignature: `telegramSendFile(credentialId: string, chatId: number, file: ${FILE_REF_TYPE}, as: string, caption: string): Promise<void>`,
  journal: { kind: 'message-out', args: ['chatId', 'file', 'as', 'caption'], result: false },
  // TS source emitted verbatim into activities.ts, alongside `telegramSendMessage`'s own — see
  // `sharedActivityCode` for the aliased `readFileBytes` import this relies on (aliased so it never
  // collides with `@falang/workflow-integrations-files`'s own identically-named import elsewhere in
  // the same concatenated module, since both `telegram`/`files` are always registered together).
  activityCode: [
    'export const telegramSendFile = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  file: IFileRef,',
    '  as: string,',
    '  caption: string,',
    '): Promise<void> => {',
    '  const botToken = await resolveTelegramBotToken(credentialId);',
    "  const mime = file.mime || '';",
    '  const resolveMethod = (): { method: string; fieldName: string } => {',
    "    if (as === 'voice') return { method: 'sendVoice', fieldName: 'voice' };",
    "    if (as === 'photo' || (as === 'auto' && mime.startsWith('image/'))) return { method: 'sendPhoto', fieldName: 'photo' };",
    "    if (as === 'video' || (as === 'auto' && mime.startsWith('video/'))) return { method: 'sendVideo', fieldName: 'video' };",
    "    if (as === 'audio' || (as === 'auto' && mime.startsWith('audio/'))) return { method: 'sendAudio', fieldName: 'audio' };",
    "    return { method: 'sendDocument', fieldName: 'document' };",
    '  };',
    '  const { method, fieldName } = resolveMethod();',
    '  // 50 MiB: comfortably over Telegram Bot API multipart limits for every attachment kind.',
    '  const bytes = await telegramReadFileBytes(file, 50 * 1024 * 1024);',
    '  const form = new FormData();',
    "  form.set('chat_id', String(chatId));",
    "  if (caption) form.set('caption', caption);",
    // `Buffer.from(bytes)` (not the bare `Uint8Array`) — `Blob`'s `BlobPart` type wants an
    // `ArrayBufferView<ArrayBuffer>`, and `readFileBytes`'s `Uint8Array` is typed over the wider
    // `ArrayBufferLike` (which also covers `SharedArrayBuffer`); `Buffer` is always real-`ArrayBuffer`-backed.
    "  form.set(fieldName, new Blob([Buffer.from(bytes)], { type: mime || 'application/octet-stream' }), file.name);",
    '  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`, {',
    "    method: 'POST',",
    '    body: form,',
    '  });',
    '  if (!response.ok) {',
    '    throw new Error(`Telegram ${method} failed: ${response.status} ${await response.text()}`);',
    '  }',
    '};',
  ].join('\n'),
  activityOptions: { kind: 'regular', startToCloseTimeout: '10 minutes', heartbeatTimeout: '1 minute' },
};
