import { describe, expect, it } from 'vitest';
import { buildQuestionNodeConfig, REPLY_WAIT_BRANCHES } from './build-question-node-config.js';
import { buildMessageWaitQuestion, MESSAGE_WAIT_DEFAULT_TIMEOUT } from './message-wait.js';
import { registerQuestionScopeContributors, type TQuestionScopeContributor } from './question-scope-contributor.js';
import type { IWorkflowIntegration } from './types.js';

const descriptor = buildMessageWaitQuestion({
  vendor: 'telegram',
  name: 'telegram-wait-message',
  label: 'telegram:question.waitMessage',
  prefix: 'telegram',
  signalName: 'telegramReply',
  messageType: { type: 'struct', id: 'telegram/Message' },
  credentialField: { name: 'credentialId', label: 'Bot', kind: 'credential-ref', vendor: 'telegram' },
  chatIdField: { name: 'chatId', label: 'Chat', kind: 'expression' },
  fromUserLabel: 'From',
  timeoutLabel: 'Timeout',
});

describe('buildMessageWaitQuestion (ADR 0079)', () => {
  it('builds a reply wait with a mandatory timeout, no resolve activity and a release on close', () => {
    expect(descriptor.replyWait).toEqual({
      variableName: 'reply',
      messageType: { type: 'struct', id: 'telegram/Message' },
    });
    expect(descriptor.timeoutField).toBe('timeout');
    expect(descriptor.resolveActivitySignature).toBeUndefined();
    expect(descriptor.askActivitySignature).toMatch(/^telegramWaitForMessage\(/);
    expect(descriptor.closeActivitySignature).toMatch(/^telegramReleaseMessageWait\(/);
    expect(descriptor.askActivityCode).toContain("vendor: 'telegram'");
    expect(descriptor.askActivityCode).toContain('/message-waits');
    expect(descriptor.questionFields.find((field) => field.name === 'timeout')?.defaultValue).toBe(
      MESSAGE_WAIT_DEFAULT_TIMEOUT,
    );
    expect(descriptor.questionFields.find((field) => field.name === 'fromUserId')?.defaultValue).toBe('');
  });

  it('seeds the node with the two fixed branches and no options', () => {
    const [header, option] = buildQuestionNodeConfig(descriptor);
    const node = header.factory?.();
    expect(node?.data).toMatchObject({ options: [], timeout: '10m', fromUserId: '' });
    expect(node?.children?.map((child) => child.data)).toEqual(REPLY_WAIT_BRANCHES);
    expect(option.name).toBe('telegram-wait-message-option');
  });

  it('binds `reply` in the message branch only', () => {
    const contributors = new Map<string, TQuestionScopeContributor>();
    const integration = { vendor: 'telegram', questions: [descriptor] } as unknown as IWorkflowIntegration;
    registerQuestionScopeContributors([integration], (name, contributor) => contributors.set(name, contributor));
    const contribute = contributors.get('telegram-wait-message-option');
    expect(contribute?.({ label: 'message', fixed: true })).toEqual([
      { name: 'reply', type: { type: 'struct', id: 'telegram/Message', constant: true } },
    ]);
    expect(contribute?.({ label: 'timeout', fixed: true })).toEqual([]);
  });
});
