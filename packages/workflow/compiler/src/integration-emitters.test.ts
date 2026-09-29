import type { INode } from '@falang/dto';
import type { IActionDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { buildIntegrationEmitters } from './integration-emitters.js';

const sendMessageAction: IActionDescriptor = {
  name: 'telegram-send-message',
  label: 'Send message',
  fields: [
    { name: 'credentialId', label: 'Bot', kind: 'credential-ref', vendor: 'telegram' },
    { name: 'chatId', label: 'Chat ID', kind: 'expression' },
    { name: 'text', label: 'Text', kind: 'expression' },
  ],
  emit: (fields) => `await telegramSendMessage(${fields.credentialId}, ${fields.chatId}, ${fields.text});`,
  activityCode: '',
  activitySignature: 'telegramSendMessage(credentialId: string, chatId: string, text: string): Promise<void>',
};

const integration: IWorkflowIntegration = {
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [sendMessageAction],
};

describe('buildIntegrationEmitters', () => {
  it('registers one emitter per action across every integration, keyed by node name', () => {
    const emitters = buildIntegrationEmitters([integration]);
    expect(Object.keys(emitters)).toEqual(['telegram-send-message']);
  });

  it('compiles expression fields verbatim and non-expression fields as string literals', () => {
    const emitters = buildIntegrationEmitters([integration]);
    // The field value itself is a template-literal expression the *user* typed — it's data here, not
    // an interpolation oxlint should evaluate against this test file's own scope.
    // oxlint-disable-next-line no-template-curly-in-string
    const textFieldValue = '`hi ${message.from.name}`';
    const node: INode = {
      id: 'n1',
      name: 'telegram-send-message',
      data: { credentialId: 'cred-1', chatId: 'message.chat.id', text: textFieldValue },
    };
    expect(emitters['telegram-send-message'](node)).toBe(
      `await telegramSendMessage("cred-1", message.chat.id, ${textFieldValue});`,
    );
  });

  it('defaults a missing field to an empty resolved value rather than throwing', () => {
    const emitters = buildIntegrationEmitters([integration]);
    const node: INode = { id: 'n1', name: 'telegram-send-message', data: { credentialId: 'cred-1' } };
    expect(emitters['telegram-send-message'](node)).toBe('await telegramSendMessage("cred-1", , );');
  });

  it('passes a result-type field through raw (not JSON.stringify-wrapped) so emit() can JSON.parse it', () => {
    const callAiAction: IActionDescriptor = {
      name: 'call-ai-text',
      label: 'Call AI (text)',
      fields: [{ name: 'result', label: 'Result', kind: 'result-type' }],
      emit: (fields) => fields.result,
      activityCode: '',
      activitySignature: 'callAiText(): Promise<string>',
    };
    const aiIntegration: IWorkflowIntegration = {
      vendor: 'openai',
      label: 'OpenAI-compatible',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [callAiAction],
    };
    const emitters = buildIntegrationEmitters([aiIntegration]);
    const node: INode = { id: 'n1', name: 'call-ai-text', data: { result: '{"type":"struct","id":"x"}' } };
    expect(emitters['call-ai-text'](node)).toBe('{"type":"struct","id":"x"}');
  });

  it('compiles a template-string field as a template literal, preserving ${expr} interpolation and escaping backticks', () => {
    const templateFieldAction: IActionDescriptor = {
      name: 'telegram-send-message',
      label: 'Send message',
      fields: [{ name: 'text', label: 'Text', kind: 'template-string' }],
      emit: (fields) => `await telegramSendMessage(${fields.text});`,
      activityCode: '',
      activitySignature: 'telegramSendMessage(text: string): Promise<void>',
    };
    const templateIntegration: IWorkflowIntegration = {
      vendor: 'telegram',
      label: 'Telegram',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [templateFieldAction],
    };
    const emitters = buildIntegrationEmitters([templateIntegration]);
    // oxlint-disable-next-line no-template-curly-in-string
    const node: INode = { id: 'n1', name: 'telegram-send-message', data: { text: 'got: ${message.text} `q`' } };
    expect(emitters['telegram-send-message'](node)).toBe(
      // oxlint-disable-next-line no-template-curly-in-string
      'await telegramSendMessage(`got: ${message.text} \\`q\\``);',
    );
  });

  it('escapes real newlines in a template-string field instead of leaving them literal', () => {
    const templateFieldAction: IActionDescriptor = {
      name: 'telegram-send-message',
      label: 'Send message',
      fields: [{ name: 'text', label: 'Text', kind: 'template-string' }],
      emit: (fields) => `await telegramSendMessage(${fields.text});`,
      activityCode: '',
      activitySignature: 'telegramSendMessage(text: string): Promise<void>',
    };
    const templateIntegration: IWorkflowIntegration = {
      vendor: 'telegram',
      label: 'Telegram',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [templateFieldAction],
    };
    const emitters = buildIntegrationEmitters([templateIntegration]);
    const node: INode = { id: 'n1', name: 'telegram-send-message', data: { text: 'line one\nline two' } };
    expect(emitters['telegram-send-message'](node)).toBe('await telegramSendMessage(`line one\\nline two`);');
  });

  it('leaves a backslash escape sequence typed inside ${...} untouched, instead of doubling it', () => {
    const templateFieldAction: IActionDescriptor = {
      name: 'telegram-send-message',
      label: 'Send message',
      fields: [{ name: 'text', label: 'Text', kind: 'template-string' }],
      emit: (fields) => `await telegramSendMessage(${fields.text});`,
      activityCode: '',
      activitySignature: 'telegramSendMessage(text: string): Promise<void>',
    };
    const templateIntegration: IWorkflowIntegration = {
      vendor: 'telegram',
      label: 'Telegram',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [templateFieldAction],
    };
    const emitters = buildIntegrationEmitters([templateIntegration]);
    // oxlint-disable-next-line no-template-curly-in-string
    const node: INode = { id: 'n1', name: 'telegram-send-message', data: { text: "joined: ${lines.join('\\n')}" } };
    expect(emitters['telegram-send-message'](node)).toBe(
      // oxlint-disable-next-line no-template-curly-in-string
      "await telegramSendMessage(`joined: ${lines.join('\\n')}`);",
    );
  });

  it('passes a new-variable field through raw (a bare identifier, not a quoted string literal)', () => {
    const callAiAction: IActionDescriptor = {
      name: 'call-ai-text',
      label: 'Call AI (text)',
      fields: [{ name: 'resultVariable', label: 'Save result to', kind: 'new-variable' }],
      emit: (fields) => `const ${fields.resultVariable} = await callAiText();`,
      activityCode: '',
      activitySignature: 'callAiText(): Promise<string>',
    };
    const aiIntegration: IWorkflowIntegration = {
      vendor: 'openai',
      label: 'OpenAI-compatible',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [callAiAction],
    };
    const emitters = buildIntegrationEmitters([aiIntegration]);
    const node: INode = { id: 'n1', name: 'call-ai-text', data: { resultVariable: 'aiReply' } };
    expect(emitters['call-ai-text'](node)).toBe('const aiReply = await callAiText();');
  });
});
