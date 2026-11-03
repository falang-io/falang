import type { INode, IProjectDocument } from '@falang/dto';
import {
  VK_QUESTION_NAME,
  VK_SEND_FILE_NAME,
  VK_SEND_MESSAGE_NAME,
  VK_TRIGGER_NAME,
  VK_VENDOR,
} from '@falang/workflow-integrations-vk';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// A real ts.Program type-check, see compile-project-question-timeout.test.ts.
vi.setConfig({ testTimeout: 45_000 });

const option = (questionId: string, label: string, extra: Record<string, unknown> = {}): INode => ({
  id: `${questionId}-${label}`,
  name: `${VK_QUESTION_NAME}-option`,
  data: { label, ...extra },
  children: [],
});

const vkBotDocument = (timeout: string): IProjectDocument => ({
  id: 'doc-1',
  type: 'trigger-function',
  name: 'onVkMessage',
  root: {
    id: 'doc-1',
    name: 'trigger-function',
    children: [
      { id: 'doc-1-header', name: 'function-header', data: '' },
      {
        id: 'doc-1-body',
        name: 'trigger-function-body',
        data: { vendor: VK_VENDOR, triggerName: VK_TRIGGER_NAME, credentialId: 'cred-1' },
        children: [
          {
            id: 'send',
            name: VK_SEND_MESSAGE_NAME,
            data: { credentialId: 'cred-1', chatId: 'message.chat.id', text: 'Hi, ${message.from?.firstName}' },
          },
          {
            id: 'file',
            name: VK_SEND_FILE_NAME,
            data: { credentialId: 'cred-1', chatId: 'message.chat.id', file: 'message.photo', as: 'auto', caption: '' },
          },
          {
            id: 'q1',
            name: VK_QUESTION_NAME,
            data: { credentialId: 'cred-1', chatId: 'message.chat.id', question: 'Continue?', timeout, options: ['Yes', 'No'] },
            children: [option('q1', 'Yes'), option('q1', 'No'), option('q1', 'timeout', { fixed: true })],
          },
        ],
      },
      { id: 'doc-1-footer', name: 'function-footer', data: '' },
    ],
  },
});

describe('compileProjectDocuments — a VK bot', () => {
  it('a trigger with send-message, send-file and a question with a timeout compiles and type-checks', () => {
    // Throws on any structural or TypeScript error, so a successful return proves both.
    const result = compileProjectDocuments([vkBotDocument('10m')], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain("condition(() => q_q1HasAnswer");
    expect(result.workflows).toContain('vkAskQuestion(');
    expect(result.activities).toContain('export const vkSendMessage');
    expect(result.activities).toContain('export const vkSendFile');
    expect(result.activities).toContain('export const vkCloseQuestion');
    expect(result.activities).not.toContain('export const telegramSendMessage');
  });

  it('a question without a timeout still compiles and type-checks', () => {
    const result = compileProjectDocuments([vkBotDocument('')], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('await condition(() => q_q1HasAnswer);');
  });
});
