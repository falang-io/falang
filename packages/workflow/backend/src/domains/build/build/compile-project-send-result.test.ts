import type { INode, IProjectDocument } from '@falang/dto';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// A real ts.Program type-check, see compile-project-question-timeout.test.ts.
vi.setConfig({ testTimeout: 45_000 });

const triggerDocument = (vendor: string, children: INode[]): IProjectDocument => ({
  id: `${vendor}Trigger`,
  type: 'trigger-function',
  name: `${vendor}Trigger`,
  root: {
    id: `${vendor}-root`,
    name: 'trigger-function',
    children: [
      { id: `${vendor}-header`, name: 'function-header', data: '' },
      {
        id: `${vendor}-body`,
        name: 'trigger-function-body',
        data: { vendor, triggerName: `${vendor}-trigger`, credentialId: 'cred-1' },
        children,
      },
      { id: `${vendor}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

/** The three send actions of a vendor, each keeping its `{ success, disabled }` result, then code that reads them. */
const sendNodes = (vendor: string, check: string): INode[] => [
  {
    id: `${vendor}-message`,
    name: `${vendor}-send-message`,
    data: { credentialId: 'cred-1', chatId: 'message.chat.id', text: 'hi', resultVariable: 'sentMessage' },
  },
  {
    id: `${vendor}-buttons`,
    name: `${vendor}-send-buttons`,
    data: {
      credentialId: 'cred-1',
      chatId: 'message.chat.id',
      text: 'menu',
      buttons: '[]',
      resultVariable: 'sentMenu',
    },
  },
  {
    id: `${vendor}-file`,
    name: `${vendor}-send-file`,
    data: {
      credentialId: 'cred-1',
      chatId: 'message.chat.id',
      file: 'message.photo',
      as: 'auto',
      caption: '',
      resultVariable: 'sentFile',
    },
  },
  { id: `${vendor}-check`, name: 'action', data: check },
];

const READ_RESULTS =
  'const blocked: boolean = sentMessage.disabled || sentMenu.disabled || (!sentFile.success && sentFile.disabled)';

describe('compileProjectDocuments — send actions return { success, disabled }', () => {
  it('Telegram, MAX and VK send results are typed variables later nodes can read', () => {
    const result = compileProjectDocuments(
      ['telegram', 'max', 'vk'].map((vendor) => triggerDocument(vendor, sendNodes(vendor, READ_RESULTS))),
      REGISTERED_INTEGRATIONS,
    );
    expect(result.workflows).toContain(
      'const sentMessage = await telegramSendMessage("cred-1", message.chat.id, `hi`);',
    );
    expect(result.workflows).toContain('const sentMenu = await vkSendButtons(');
    for (const guard of ['telegramSendGuarded', 'maxSendGuarded', 'vkSendGuarded']) {
      expect(result.activities).toContain(`const ${guard} =`);
    }
  });

  it('without a result variable the call is a plain statement, as before', () => {
    const result = compileProjectDocuments(
      [
        triggerDocument('telegram', [
          {
            id: 'telegram-message',
            name: 'telegram-send-message',
            data: { credentialId: 'cred-1', chatId: 'message.chat.id', text: 'hi' },
          },
        ]),
      ],
      REGISTERED_INTEGRATIONS,
    );
    expect(result.workflows).toContain('await telegramSendMessage("cred-1", message.chat.id, `hi`);');
    expect(result.workflows).not.toContain('const undefined');
  });

  it('the result is typed: a property that does not exist is a type error', () => {
    expect(() =>
      compileProjectDocuments(
        [triggerDocument('max', sendNodes('max', 'const blocked: boolean = sentMessage.blocked'))],
        REGISTERED_INTEGRATIONS,
      ),
    ).toThrow(BadRequestException);
  });
});
