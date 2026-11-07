import type { INode, IProjectDocument } from '@falang/dto';
import {
  VK_DELETE_MESSAGE_NAME,
  VK_KICK_FROM_CHAT_NAME,
  VK_SEND_MESSAGE_NAME,
  VK_TRIGGER_NAME,
  VK_VENDOR,
} from '@falang/workflow-integrations-vk';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// A real ts.Program type-check, see compile-project-question-timeout.test.ts.
vi.setConfig({ testTimeout: 45_000 });

const vkNode = (id: string, name: string, data: Record<string, unknown>): INode => ({ id, name, data });

const triggerDocument = (
  id: string,
  triggerName: string,
  body: INode[],
  triggerConfig?: Record<string, string>,
): IProjectDocument => ({
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
        data: { vendor: VK_VENDOR, triggerName, credentialId: 'cred-1', ...(triggerConfig ? { triggerConfig } : {}) },
        children: body,
      },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

const hello = (id: string, userExpression: string): INode =>
  vkNode(`${id}-hello`, VK_SEND_MESSAGE_NAME, {
    credentialId: 'cred-1',
    chatId: userExpression,
    text: `Welcome \${${userExpression}}`,
  });

describe('compileProjectDocuments — VK community management', () => {
  const documents: IProjectDocument[] = [
    triggerDocument('doc-group-in', 'vk-group-member-joined', [hello('gi', 'event.userId')]),
    triggerDocument('doc-group-out', 'vk-group-member-left', [hello('go', 'event.userId')]),
    triggerDocument('doc-request', 'vk-join-request', [hello('rq', 'request.userId')]),
    triggerDocument('doc-chat-in', 'vk-chat-member-joined', [
      hello('ci', 'event.chat.id'),
      vkNode('kick', VK_KICK_FROM_CHAT_NAME, {
        credentialId: 'cred-1',
        chatId: 'event.chat.id',
        userId: 'event.userId',
      }),
    ]),
    triggerDocument('doc-chat-out', 'vk-chat-member-left', [
      vkNode('del-left', VK_DELETE_MESSAGE_NAME, {
        credentialId: 'cred-1',
        chatId: 'event.chat.id',
        messageId: 'event.date',
      }),
    ]),
    triggerDocument(
      'doc-moderate',
      VK_TRIGGER_NAME,
      [
        vkNode('del', VK_DELETE_MESSAGE_NAME, {
          credentialId: 'cred-1',
          chatId: 'message.chat.id',
          messageId: 'message.conversationMessageId',
        }),
        vkNode('kick2', VK_KICK_FROM_CHAT_NAME, {
          credentialId: 'cred-1',
          chatId: 'message.chat.id',
          userId: 'message.from?.id ?? 0',
        }),
      ],
      { chatType: 'group', conversation: 'per-event' },
    ),
  ];

  it('every member trigger and both moderation actions compile and type-check', () => {
    // Throws on any structural or TypeScript error, so a successful return proves both.
    const result = compileProjectDocuments(documents, REGISTERED_INTEGRATIONS);
    for (const signal of [
      'vkGroupMemberJoined',
      'vkGroupMemberLeft',
      'vkJoinRequest',
      'vkChatMemberJoined',
      'vkChatMemberLeft',
    ]) {
      expect(result.workflows).toContain(signal);
    }
    expect(result.activities).toContain('export const vkKickFromChat');
    expect(result.activities).toContain('export const vkDeleteMessage');
    expect(result.activities).toContain('const vkErrorCode');
    expect(result.activities).not.toContain('export const telegramSendMessage');
  });

  it('a project with a member trigger and the vk on-message trigger shares one activities module without clashes', () => {
    const result = compileProjectDocuments([documents[0], documents[5]], REGISTERED_INTEGRATIONS);
    expect(result.activities.match(/const vkCommunityId/g)).toHaveLength(1);
  });
});
