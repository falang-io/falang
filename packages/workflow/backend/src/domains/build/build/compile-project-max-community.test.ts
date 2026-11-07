import type { INode, IProjectDocument } from '@falang/dto';
import {
  MAX_DELETE_MESSAGE_NAME,
  MAX_MEMBER_JOINED_TRIGGER_NAME,
  MAX_MEMBER_LEFT_TRIGGER_NAME,
  MAX_REMOVE_MEMBER_NAME,
  MAX_SEND_MESSAGE_NAME,
  MAX_TRIGGER_NAME,
  MAX_VENDOR,
} from '@falang/workflow-integrations-max';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// A real ts.Program type-check, see compile-project-question-timeout.test.ts.
vi.setConfig({ testTimeout: 45_000 });

const triggerDocument = (
  id: string,
  triggerName: string,
  triggerConfig: Record<string, string> | null,
  children: readonly INode[],
): IProjectDocument => ({
  id,
  type: 'trigger-function',
  name: `on_${id}`,
  root: {
    id,
    name: 'trigger-function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      {
        id: `${id}-body`,
        name: 'trigger-function-body',
        data: { vendor: MAX_VENDOR, triggerName, credentialId: 'cred-1', ...(triggerConfig ? { triggerConfig } : {}) },
        children: [...children],
      },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

describe('compileProjectDocuments — MAX community management', () => {
  it('member triggers and the moderation actions compile and type-check', () => {
    const documents = [
      triggerDocument('joined', MAX_MEMBER_JOINED_TRIGGER_NAME, null, [
        {
          id: 'welcome',
          name: MAX_SEND_MESSAGE_NAME,
          data: { credentialId: 'cred-1', chatId: 'event.chat.id', text: 'Welcome, ${event.user.firstName}!' },
        },
      ]),
      triggerDocument('left', MAX_MEMBER_LEFT_TRIGGER_NAME, null, [
        {
          id: 'kick',
          name: MAX_REMOVE_MEMBER_NAME,
          data: { credentialId: 'cred-1', chatId: 'event.chat.id', userId: 'event.user.id', block: 'event.byId !== undefined' },
        },
      ]),
      triggerDocument('spam', MAX_TRIGGER_NAME, { chatType: 'group', conversation: 'per-event' }, [
        {
          id: 'del',
          name: MAX_DELETE_MESSAGE_NAME,
          data: { credentialId: 'cred-1', messageId: 'message.messageId' },
        },
        {
          id: 'ban',
          name: MAX_REMOVE_MEMBER_NAME,
          data: { credentialId: 'cred-1', chatId: 'message.chat.id', userId: 'message.from!.id', block: 'true' },
        },
      ]),
    ];
    // Throws on any structural or TypeScript error, so a successful return proves both.
    const result = compileProjectDocuments(documents, REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('maxRemoveMember(');
    expect(result.workflows).toContain('maxDeleteMessage(');
    expect(result.activities).toContain('export const maxRemoveMember');
    expect(result.activities).toContain('export const maxDeleteMessage');
    expect(result.activities).toContain('const maxModerationDelete');
    expect(result.workflows).toContain('maxMemberJoined');
    expect(result.workflows).toContain('maxMemberLeft');
  });
});
