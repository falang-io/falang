import type { INode, IProjectDocument } from '@falang/dto';
import { TELEGRAM_VENDOR } from '@falang/workflow-integrations-telegram';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// A real ts.Program type-check, see compile-project-question-timeout.test.ts.
vi.setConfig({ testTimeout: 45_000 });

const triggerDocument = (
  id: string,
  triggerName: string,
  children: INode[],
  triggerConfig?: Record<string, string>,
): IProjectDocument => ({
  id,
  type: 'trigger-function',
  name: id,
  root: {
    id,
    name: 'trigger-function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      {
        id: `${id}-body`,
        name: 'trigger-function-body',
        data: { vendor: TELEGRAM_VENDOR, triggerName, credentialId: 'cred-1', ...(triggerConfig ? { triggerConfig } : {}) },
        children,
      },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

const node = (id: string, name: string, data: Record<string, string>): INode => ({ id, name, data });

describe('compileProjectDocuments — Telegram community management (ADR 0076 (private))', () => {
  it('a member-joined trigger with get-member, ban, unban and send-message compiles and type-checks', () => {
    const result = compileProjectDocuments(
      [
        triggerDocument('onJoin', 'telegram-member-joined', [
          node('who', 'telegram-get-member', {
            credentialId: 'cred-1',
            chatId: 'event.chat.id',
            userId: 'event.user.id',
            resultVariable: 'info',
          }),
          node('hello', 'telegram-send-message', {
            credentialId: 'cred-1',
            chatId: 'event.chat.id',
            text: 'Welcome ${event.user.firstName} (${info.status}, admin: ${info.isAdmin})',
          }),
          node('ban', 'telegram-ban-member', {
            credentialId: 'cred-1',
            chatId: 'event.chat.id',
            userId: 'event.user.id',
            untilDate: '0',
            revokeMessages: 'true',
          }),
          node('unban', 'telegram-unban-member', {
            credentialId: 'cred-1',
            chatId: 'event.chat.id',
            userId: 'event.user.id',
          }),
        ]),
      ],
      REGISTERED_INTEGRATIONS,
    );
    expect(result.workflows).toContain('telegramMemberJoined');
    expect(result.workflows).toContain('const info = await telegramGetMember(');
    for (const activity of ['telegramBanMember', 'telegramUnbanMember', 'telegramGetMember', 'telegramModerationCall']) {
      expect(result.activities).toContain(activity);
    }
  });

  it('a member-left trigger reading event.kicked and event.by compiles', () => {
    compileProjectDocuments(
      [
        triggerDocument('onLeave', 'telegram-member-left', [
          node('say', 'telegram-send-message', {
            credentialId: 'cred-1',
            chatId: 'event.chat.id',
            text: '${event.user.firstName} left (kicked: ${event.kicked}, by: ${event.by?.firstName ?? "nobody"})',
          }),
        ]),
      ],
      REGISTERED_INTEGRATIONS,
    );
  });

  it('a join-request trigger with approve and decline compiles and type-checks', () => {
    const result = compileProjectDocuments(
      [
        triggerDocument('onRequest', 'telegram-join-request', [
          node('approve', 'telegram-approve-join-request', {
            credentialId: 'cred-1',
            chatId: 'request.chat.id',
            userId: 'request.user.id',
          }),
          node('decline', 'telegram-decline-join-request', {
            credentialId: 'cred-1',
            chatId: 'request.chat.id',
            userId: 'request.user.id',
          }),
          node('dm', 'telegram-send-message', {
            credentialId: 'cred-1',
            chatId: 'request.userChatId',
            text: 'Welcome',
          }),
        ]),
      ],
      REGISTERED_INTEGRATIONS,
    );
    expect(result.workflows).toContain('telegramJoinRequest');
    expect(result.activities).toContain('export const telegramApproveJoinRequest');
    expect(result.activities).toContain('export const telegramDeclineJoinRequest');
  });

  it('a group on-message moderator: delete-message and ban compile and type-check', () => {
    const result = compileProjectDocuments(
      [
        triggerDocument(
          'moderate',
          'telegram-trigger',
          [
            node('del', 'telegram-delete-message', {
              credentialId: 'cred-1',
              chatId: 'message.chat.id',
              messageId: 'message.messageId',
            }),
            node('ban', 'telegram-ban-member', {
              credentialId: 'cred-1',
              chatId: 'message.chat.id',
              userId: 'message.from?.id ?? 0',
              untilDate: '',
              revokeMessages: '',
            }),
          ],
          { chatType: 'group', conversation: 'per-event' },
        ),
      ],
      REGISTERED_INTEGRATIONS,
    );
    expect(result.activities).toContain('export const telegramDeleteMessage');
    // Empty optional fields fall back to their defaults in the emitted call.
    expect(result.workflows).toContain('telegramBanMember("cred-1", message.chat.id, message.from?.id ?? 0, 0, false)');
  });
});
