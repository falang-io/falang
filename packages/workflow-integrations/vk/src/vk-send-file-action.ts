import type { TVariableInfo } from '@falang/typescript-dto';
import {
  type IActionDescriptor,
  emitMessageSend,
  MESSAGE_SEND_RESULT_TS_TYPE,
} from '@falang/workflow-integrations-common';
import { fileTypeInfo } from '@falang/workflow-integrations-files';
import { VK_SEND_FILE_NAME, VK_VENDOR } from './constants.js';
import { VK_SEND_RESULT_FIELD, VK_SEND_RESULT_TYPE } from './vk-send-result.js';

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/** Inlined `IFileRef` shape — `activitySignature` text lands in `workflows.ts`, which never imports the files vendor (see MAX's `max-send-file-action.ts`). */
const FILE_REF_TYPE = '{ id: string; name: string; size: number; mime: string; publicUrl?: string }';

const AS_OPTIONS = [
  { value: 'auto', label: 'vk:sendFileAs.auto' },
  { value: 'photo', label: 'vk:sendFileAs.photo' },
  { value: 'document', label: 'vk:sendFileAs.document' },
];

/**
 * Sends a `files/File` to a chat as a VK attachment. Images go through `photos.getMessagesUploadServer` ->
 * multipart `photo` -> `photos.saveMessagesPhoto`, anything else through `docs.getMessagesUploadServer` -> multipart
 * `file` -> `docs.save`; the resulting `photo<owner>_<id>`/`doc<owner>_<id>` is attached to `messages.send`. The upload URL
 * carries its own signature, so the bytes go straight to it (not through the API base URL).
 */
export const vkSendFileAction: IActionDescriptor = {
  name: VK_SEND_FILE_NAME,
  label: 'vk:action.sendFile',
  fields: [
    { name: 'credentialId', label: 'vk:field.bot', kind: 'credential-ref', vendor: VK_VENDOR },
    { name: 'chatId', label: 'vk:field.chatId', help: 'vk:help.chatId', kind: 'expression', expectedType: anyNumber },
    { name: 'file', label: 'vk:field.file', kind: 'expression', expectedType: fileTypeInfo() },
    { name: 'as', label: 'vk:field.sendFileAs', kind: 'select', options: AS_OPTIONS },
    { name: 'caption', label: 'vk:field.caption', kind: 'template-string' },
    VK_SEND_RESULT_FIELD,
  ],
  resultType: VK_SEND_RESULT_TYPE,
  emit: (fields) =>
    emitMessageSend(
      fields,
      `await vkSendFile(${fields.credentialId}, ${fields.chatId}, ${fields.file}, ${fields.as}, ${fields.caption})`,
    ),
  activitySignature: `vkSendFile(credentialId: string, chatId: number, file: ${FILE_REF_TYPE}, as: string, caption: string): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}>`,
  journal: { kind: 'message-out', args: ['chatId', 'file', 'as', 'caption'] },
  activityCode: [
    'export const vkSendFile = async (',
    '  credentialId: string,',
    '  chatId: number,',
    '  file: IFileRef,',
    '  as: string,',
    '  caption: string,',
    `): Promise<${MESSAGE_SEND_RESULT_TS_TYPE}> =>`,
    '  vkSendGuarded(async () => {',
    '    const bot = await resolveVkAccessToken(credentialId);',
    "    const mime = file.mime || '';",
    "    const isPhoto = as === 'photo' || (as === 'auto' && mime.startsWith('image/'));",
    '    const bytes = await vkReadFileBytes(file, 50 * 1024 * 1024);',
    "    const blob = new Blob([Buffer.from(bytes)], { type: mime || 'application/octet-stream' });",
    '    const upload = async (url: string, field: string): Promise<any> => {',
    '      const form = new FormData();',
    '      form.set(field, blob, file.name);',
    "      const response = await fetch(url, { method: 'POST', body: form });",
    '      const text = await response.text();',
    '      if (!response.ok) throw new Error(`VK upload failed: ${response.status} ${text}`);',
    '      return JSON.parse(text);',
    '    };',
    "    let attachment = '';",
    '    if (isPhoto) {',
    "      const server = await vkApiCall(bot, 'photos.getMessagesUploadServer', { peer_id: chatId });",
    "      const uploaded = await upload(server.upload_url, 'photo');",
    "      const saved = await vkApiCall(bot, 'photos.saveMessagesPhoto', {",
    '        photo: uploaded.photo,',
    '        server: uploaded.server,',
    '        hash: uploaded.hash,',
    '      });',
    '      const photo = saved[0];',
    "      attachment = `photo${photo.owner_id}_${photo.id}${photo.access_key ? `_${photo.access_key}` : ''}`;",
    '    } else {',
    "      const server = await vkApiCall(bot, 'docs.getMessagesUploadServer', { type: 'doc', peer_id: chatId });",
    "      const uploaded = await upload(server.upload_url, 'file');",
    "      const saved = await vkApiCall(bot, 'docs.save', { file: uploaded.file, title: file.name });",
    '      const doc = saved.doc ?? saved[0];',
    "      attachment = `doc${doc.owner_id}_${doc.id}${doc.access_key ? `_${doc.access_key}` : ''}`;",
    '    }',
    '    await vkSendText(bot, chatId, caption, { attachment });',
    '  });',
  ].join('\n'),
  activityOptions: { kind: 'regular', startToCloseTimeout: '10 minutes', heartbeatTimeout: '1 minute' },
};
