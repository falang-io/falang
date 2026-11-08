import { BadRequestException } from '@nestjs/common';
import type { INode, IProjectDocument } from '@falang/dto';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// Real ts.Program type-check, see compile-project-documents.test.ts.
vi.setConfig({ testTimeout: 180_000 });

/** A `<vendor>-wait-message` node (ADR 0079 (private)) answering in its message branch and logging on timeout. */
const waitNode = (vendor: string, id: string, chatId: string, timeout: string): INode => ({
  id,
  name: `${vendor}-wait-message`,
  data: { credentialId: 'cred-1', chatId, fromUserId: '', timeout, options: [] },
  children: [
    {
      id: `${id}-message`,
      name: `${vendor}-wait-message-option`,
      data: { label: 'message', fixed: true },
      children: [
        {
          id: `${id}-send`,
          name: `${vendor}-send-message`,
          data: { credentialId: 'cred-1', chatId, text: 'Hello, ${reply.text}' },
        },
      ],
    },
    {
      id: `${id}-timeout`,
      name: `${vendor}-wait-message-option`,
      data: { label: 'timeout', fixed: true },
      children: [{ id: `${id}-log`, name: 'log', data: 'no answer' }],
    },
  ],
});

const triggerDocument = (vendor: string, body: INode[]): IProjectDocument => ({
  id: `doc-${vendor}`,
  type: 'trigger-function',
  name: `on${vendor[0].toUpperCase()}${vendor.slice(1)}Message`,
  root: {
    id: `tf-${vendor}`,
    name: 'trigger-function',
    children: [
      { id: `tf-${vendor}-h`, name: 'function-header', data: '' },
      {
        id: `tf-${vendor}-b`,
        name: 'trigger-function-body',
        data: { vendor, triggerName: `${vendor}-trigger`, credentialId: 'cred-1' },
        children: body,
      },
      { id: `tf-${vendor}-f`, name: 'function-footer', data: '' },
    ],
  },
});

describe('compiling the messenger "wait for message" node (ADR 0079)', () => {
  it('compiles and type-checks a wait in a Telegram, MAX and VK trigger and in a plain function', () => {
    const fn: IProjectDocument = {
      id: 'doc-fn',
      type: 'function',
      name: 'askAgain',
      root: {
        id: 'fn',
        name: 'function',
        children: [
          { id: 'fn-h', name: 'function-header', data: '' },
          {
            id: 'fn-b',
            name: 'function-body',
            data: { parameters: [{ name: 'chat', type: { type: 'number' } }] },
            children: [waitNode('telegram', 'wf', 'chat', '2h')],
          },
          { id: 'fn-f', name: 'function-footer', data: '' },
        ],
      },
    };
    const documents = [
      // Two waits in a row in one function: their variables must not collide.
      triggerDocument('telegram', [
        waitNode('telegram', 'w1', 'message.chat.id', '10m'),
        waitNode('telegram', 'w2', 'message.chat.id', '1d'),
      ]),
      triggerDocument('max', [waitNode('max', 'm1', 'message.chat.id', '30s')]),
      triggerDocument('vk', [waitNode('vk', 'v1', 'message.chat.id', '5m')]),
      fn,
    ];

    const result = compileProjectDocuments(documents, REGISTERED_INTEGRATIONS);

    expect(result.workflows).toContain('const q_w1WaitId = (await telegramWaitForMessage("cred-1", message.chat.id, undefined, 600000)).messageId;');
    expect(result.workflows).toContain("setHandler(defineSignal<[{ waitId: string; message: any }]>('telegramReply')");
    expect(result.workflows).toContain('q_w1Answered = await condition(() => q_w1Payload !== undefined, 600000);');
    expect(result.workflows).toContain('await telegramReleaseMessageWait("cred-1", message.chat.id, q_w1WaitId, \'expired\');');
    expect(result.workflows).toContain('const reply = q_w1Payload!.message;');
    expect(result.workflows).toContain('maxWaitForMessage(');
    expect(result.workflows).toContain('vkWaitForMessage(');
    expect(result.activities).toContain('export const telegramWaitForMessage = async (');
    expect(result.activities).toContain('/message-waits');
  });

  it('refuses a wait without a timeout, naming the node', () => {
    const documents = [triggerDocument('telegram', [waitNode('telegram', 'w1', 'message.chat.id', '  ')])];
    try {
      compileProjectDocuments(documents, REGISTERED_INTEGRATIONS);
      expect.unreachable('compileProjectDocuments should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as { errors: { nodeId?: string; message: string }[] };
      expect(body.errors).toContainEqual(expect.objectContaining({ nodeId: 'w1', message: expect.stringContaining('timeout') }));
    }
  });

  it('refuses an unparseable timeout', () => {
    const documents = [triggerDocument('telegram', [waitNode('telegram', 'w1', 'message.chat.id', 'soon')])];
    expect(() => compileProjectDocuments(documents, REGISTERED_INTEGRATIONS)).toThrow(BadRequestException);
  });
});
