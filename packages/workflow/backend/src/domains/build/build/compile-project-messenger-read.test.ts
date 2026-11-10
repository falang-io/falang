import type { INode, IProjectDocument } from '@falang/dto';
import {
  MAX_GET_MESSAGE_NAME,
  MAX_GET_MESSAGES_NAME,
  MAX_SEND_MESSAGE_NAME,
  MAX_TRIGGER_NAME,
  MAX_VENDOR,
} from '@falang/workflow-integrations-max';
import {
  VK_GET_MESSAGE_NAME,
  VK_GET_MESSAGES_NAME,
  VK_SEND_MESSAGE_NAME,
  VK_TRIGGER_NAME,
  VK_VENDOR,
} from '@falang/workflow-integrations-vk';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// A real ts.Program type-check, see compile-project-question-timeout.test.ts.
vi.setConfig({ testTimeout: 45_000 });

const triggerDocument = (id: string, vendor: string, triggerName: string, body: INode[]): IProjectDocument => ({
  id,
  type: 'trigger-function',
  name: id.replaceAll('-', ''),
  root: {
    id,
    name: 'trigger-function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      {
        id: `${id}-body`,
        name: 'trigger-function-body',
        data: { vendor, triggerName, credentialId: 'cred-1' },
        children: body,
      },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

describe('compileProjectDocuments — reading messenger messages', () => {
  it('MAX and VK get-messages/get-message compile, and their results are usable later', () => {
    const documents = [
      triggerDocument('max-doc', MAX_VENDOR, MAX_TRIGGER_NAME, [
        {
          id: 'max-history',
          name: MAX_GET_MESSAGES_NAME,
          data: { credentialId: 'cred-1', chatId: 'message.chat.id', count: '10', resultVariable: 'history' },
        },
        {
          id: 'max-one',
          name: MAX_GET_MESSAGE_NAME,
          data: { credentialId: 'cred-1', messageId: 'message.messageId', resultVariable: 'same' },
        },
        {
          id: 'max-echo',
          name: MAX_SEND_MESSAGE_NAME,
          data: {
            credentialId: 'cred-1',
            chatId: 'message.chat.id',
            text: '${history.length} ${history[0]?.text ?? ""} ${same.messageId}',
          },
        },
      ]),
      triggerDocument('vk-doc', VK_VENDOR, VK_TRIGGER_NAME, [
        {
          id: 'vk-history',
          name: VK_GET_MESSAGES_NAME,
          data: { credentialId: 'cred-1', chatId: 'message.chat.id', count: '50', resultVariable: 'history' },
        },
        {
          id: 'vk-one',
          name: VK_GET_MESSAGE_NAME,
          data: {
            credentialId: 'cred-1',
            chatId: 'message.chat.id',
            messageId: 'message.conversationMessageId',
            resultVariable: 'same',
          },
        },
        {
          id: 'vk-echo',
          name: VK_SEND_MESSAGE_NAME,
          data: { credentialId: 'cred-1', chatId: 'message.chat.id', text: '${history.length} ${same.text}' },
        },
      ]),
    ];
    // Throws on any structural or TypeScript error, so a successful return proves both.
    const result = compileProjectDocuments(documents, REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('const history = await maxGetMessages(');
    expect(result.workflows).toContain('const same = await vkGetMessage(');
    expect(result.activities).toContain('export const maxGetMessages');
    expect(result.activities).toContain('const maxToMessage');
    expect(result.activities).toContain('export const vkGetMessages');
    expect(result.activities).toContain('const vkToMessage');
  });
});
