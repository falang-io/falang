import { BadRequestException } from '@nestjs/common';
import type { INode, IProjectDocument } from '@falang/dto';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

vi.setConfig({ testTimeout: 180_000 });

const askNode = (vendor: string, id: string, buttons: string, answerVariable = 'choice', timeout = '10m'): INode => ({
  id,
  name: `${vendor}-ask-buttons`,
  data: {
    credentialId: 'cred-1',
    ...(vendor === 'max' ? { recipient: 'chat' } : {}),
    chatId: 'message.chat.id',
    text: 'Pick one',
    buttons,
    timeout,
    answerVariable,
    options: [],
  },
  children: [
    {
      id: `${id}-pressed`,
      name: `${vendor}-ask-buttons-option`,
      data: { label: 'pressed', fixed: true, variable: answerVariable },
      children: [
        {
          id: `${id}-check`,
          name: 'action',
          data: `const picked: string = ${answerVariable}.value; const pressedBy: number = ${answerVariable}.userId;`,
        },
      ],
    },
    {
      id: `${id}-timeout`,
      name: `${vendor}-ask-buttons-option`,
      data: { label: 'timeout', fixed: true },
      children: [{ id: `${id}-log`, name: 'log', data: 'no answer' }],
    },
  ],
});

const triggerDocument = (vendor: string, children: INode[]): IProjectDocument => ({
  id: `doc-${vendor}`,
  type: 'trigger-function',
  name: `on${vendor}Message`,
  root: {
    id: `tf-${vendor}`,
    name: 'trigger-function',
    children: [
      { id: `tf-${vendor}-h`, name: 'function-header', data: '' },
      {
        id: `tf-${vendor}-b`,
        name: 'trigger-function-body',
        data: { vendor, triggerName: `${vendor}-trigger`, credentialId: 'cred-1' },
        children,
      },
      { id: `tf-${vendor}-f`, name: 'function-footer', data: '' },
    ],
  },
});

const variable = (id: string): INode => ({
  id,
  name: 'action',
  data: 'const dynamicButtons = [{ kind: "command", text: "Approve", value: "approve" }, { kind: "url", text: "Docs", value: "https://example.com" }];',
});

describe('compiling messenger ask-buttons', () => {
  it('compiles and type-checks a variable-supplied wait for Telegram, MAX and VK', () => {
    const result = compileProjectDocuments(
      ['telegram', 'max', 'vk'].map((vendor) =>
        triggerDocument(vendor, [
          variable(`${vendor}-buttons`),
          askNode(vendor, `${vendor}Ask`, JSON.stringify({ expression: 'dynamicButtons' })),
        ]),
      ),
      REGISTERED_INTEGRATIONS,
    );
    for (const vendor of ['telegram', 'max', 'vk']) {
      expect(result.workflows).toContain(`const q_${vendor}AskButtons = dynamicButtons;`);
      expect(result.workflows).toContain(`const choice:`);
      expect(result.workflows).toContain(`value: q_${vendor}AskPressedButton!.value`);
      expect(result.activities).toContain(`export const ${vendor}AskButtons = async (`);
    }
    expect(result.workflows).toContain("defineSignal<[{ waitId: string; buttonIndex: number; userId: number }]>(");
    expect(result.workflows).toContain("q_telegramAskButtons[payload.buttonIndex]?.kind === 'command'");
    expect(result.activities).toContain('/button-waits');
    expect(result.activities).toContain('falang-wait:');
  });

  it('compiles the visual list with its template fields', () => {
    const buttons = JSON.stringify([{ kind: 'command', text: 'For ${message.chat.id}', value: 'approve' }]);
    const result = compileProjectDocuments(
      [triggerDocument('telegram', [askNode('telegram', 'askStatic', buttons, 'answer', '2h')])],
      REGISTERED_INTEGRATIONS,
    );
    expect(result.workflows).toContain('const q_askStaticButtons = [{ kind: "command", text: `For ${message.chat.id}`, value: `approve` }];');
    expect(result.workflows).toContain('const answer:');
    expect(result.workflows).toContain('7200000');
  });

  it.each([
    ['empty timeout', 'answer', ''],
    ['invalid answer name', 'bad-name', '10m'],
    ['empty answer name', '', '10m'],
  ])('refuses %s with a node error', (_name, answerVariable, timeout) => {
    expect(() =>
      compileProjectDocuments(
        [triggerDocument('telegram', [askNode('telegram', 'badWait', '[]', answerVariable, timeout)])],
        REGISTERED_INTEGRATIONS,
      ),
    ).toThrow(BadRequestException);
  });
});
