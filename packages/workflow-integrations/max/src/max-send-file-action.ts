import type { TVariableInfo } from '@falang/typescript-dto';
import type { IActionDescriptor } from '@falang/workflow-integrations-common';
import { fileTypeInfo } from '@falang/workflow-integrations-files';
import { MAX_SEND_FILE_NAME, MAX_VENDOR } from './constants.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/** Inlined `IFileRef` shape — `activitySignature` text lands in `workflows.ts`, which never imports the files vendor (see Telegram's `telegram-send-file-action.ts`). */
const FILE_REF_TYPE = '{ id: string; name: string; size: number; mime: string; publicUrl?: string }';

const AS_OPTIONS = [
  { value: 'auto', label: 'max:sendFileAs.auto' },
  { value: 'photo', label: 'max:sendFileAs.photo' },
  { value: 'document', label: 'max:sendFileAs.document' },
  { value: 'video', label: 'max:sendFileAs.video' },
  { value: 'audio', label: 'max:sendFileAs.audio' },
];

/**
 * Sends a `files/File` to a chat as a Max attachment — Max's three-step upload: `POST /uploads?type=…` gives an
 * upload URL, the bytes go there as multipart `data`, and the token (from the upload response for `image`/`file`, from
 * the first response for `video`/`audio`) is attached to `POST /messages`.
 */
export const maxSendFileAction: IActionDescriptor = {
  name: MAX_SEND_FILE_NAME,
  label: 'max:action.sendFile',
  fields: [
    { name: 'credentialId', label: 'max:field.bot', kind: 'credential-ref', vendor: MAX_VENDOR },
    { name: 'chatId', label: 'max:field.chatId', kind: 'expression', expectedType: anyNumber },
    { name: 'file', label: 'max:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'as', label: 'max:field.sendFileAs', kind: 'select', options: AS_OPTIONS },
    { name: 'caption', label: 'max:field.caption', kind: 'template-string' },
  ],
  emit: (fields) =>
    `await maxSendFile(${fields.credentialId}, ${fields.chatId}, ${fields.file}, ${fields.as}, ${fields.caption});`,
  activitySignature: `maxSendFile(credentialId: string, chatId: number, file: ${FILE_REF_TYPE}, as: string, caption: string): Promise<void>`,
  journal: { kind: 'message-out', args: ['chatId', 'file', 'as', 'caption'], result: false },
  activityCode: [
    'export const maxSendFile = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  file: IFileRef,',
    '  as: string,',
    '  caption: string,',
    '): Promise<void> => {',
    '  const bot = await resolveMaxBotToken(credentialId);',
    "  const mime = file.mime || '';",
    "  const resolveType = (): 'image' | 'video' | 'audio' | 'file' => {",
    "    if (as === 'photo' || (as === 'auto' && mime.startsWith('image/'))) return 'image';",
    "    if (as === 'video' || (as === 'auto' && mime.startsWith('video/'))) return 'video';",
    "    if (as === 'audio' || (as === 'auto' && mime.startsWith('audio/'))) return 'audio';",
    "    return 'file';",
    '  };',
    '  const type = resolveType();',
    '  const bytes = await maxReadFileBytes(file, 50 * 1024 * 1024);',
    "  const upload = await maxApiRequest(bot, 'POST', 'uploads', { type });",
    '  const form = new FormData();',
    // `Buffer.from(bytes)`: `Blob` wants an `ArrayBuffer`-backed view (see Telegram's send-file action).
    "  form.set('data', new Blob([Buffer.from(bytes)], { type: mime || 'application/octet-stream' }), file.name);",
    "  const uploadResponse = await fetch(upload.url, { method: 'POST', body: form });",
    '  const uploadText = await uploadResponse.text();',
    '  if (!uploadResponse.ok) {',
    '    throw new Error(`Max upload (${type}) failed: ${uploadResponse.status} ${uploadText}`);',
    '  }',
    "  const uploaded = type === 'image' || type === 'file' ? JSON.parse(uploadText) : {};",
    "  const payload = type === 'image' ? { photos: uploaded.photos } : { token: type === 'file' ? uploaded.token : upload.token };",
    '  await maxApiRequest(',
    '    bot,',
    "    'POST',",
    "    'messages',",
    '    { chat_id: chatId },',
    '    { text: caption || undefined, attachments: [{ type, payload }] },',
    '  );',
    '};',
  ].join('\n'),
  activityOptions: { kind: 'regular', startToCloseTimeout: '10 minutes', heartbeatTimeout: '1 minute' },
};
