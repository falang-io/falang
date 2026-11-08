import type { INode, IProjectDocument } from '@falang/dto';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// A real ts.Program type-check, see compile-project-question-timeout.test.ts.
vi.setConfig({ testTimeout: 45_000 });

const BUTTONS = JSON.stringify([
  { kind: 'url', text: 'Site of ${message.chat.id}', value: 'https://example.com/?chat=${message.chat.id}' },
  { kind: 'command', text: 'Help', value: 'help' },
]);

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

const sendButtons = (vendor: string, buttons: string): INode => ({
  id: `${vendor}-send`,
  name: `${vendor}-send-buttons`,
  data: { credentialId: 'cred-1', chatId: 'message.chat.id', text: 'Menu for ${message.chat.id}', buttons },
});

describe('compileProjectDocuments — send message with buttons', () => {
  it('Telegram, MAX and VK send-buttons nodes compile and type-check together', () => {
    const result = compileProjectDocuments(
      ['telegram', 'max', 'vk'].map((vendor) => triggerDocument(vendor, [sendButtons(vendor, BUTTONS)])),
      REGISTERED_INTEGRATIONS,
    );
    expect(result.workflows).toContain(
      'await telegramSendButtons("cred-1", message.chat.id, `Menu for ${message.chat.id}`, [{ kind: "url", text: `Site of ${message.chat.id}`, value: `https://example.com/?chat=${message.chat.id}` }, { kind: "command", text: `Help`, value: `help` }]);',
    );
    for (const name of ['telegramSendButtons', 'maxSendButtons', 'vkSendButtons']) {
      expect(result.activities).toContain(`export const ${name}`);
    }
    for (const helper of ['telegramPrepareButtons', 'maxPrepareButtons', 'vkPrepareButtons']) {
      expect(result.activities).toContain(`const ${helper} =`);
    }
    expect(result.activities).toContain('falang-cmd:');
  });

  it('an empty button list compiles to an empty array', () => {
    const result = compileProjectDocuments([triggerDocument('telegram', [sendButtons('telegram', '[]')])], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('`Menu for ${message.chat.id}`, []);');
  });

  it('a malformed button list is a compile error of the node', () => {
    let caught: unknown = null;
    try {
      compileProjectDocuments([triggerDocument('telegram', [sendButtons('telegram', '{oops')])], REGISTERED_INTEGRATIONS);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify((caught as BadRequestException).getResponse())).toMatch(
      /"nodeId":"telegram-send".*Buttons are not valid JSON/,
    );
  });
});
