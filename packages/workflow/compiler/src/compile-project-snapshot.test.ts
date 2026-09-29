import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';

/**
 * A full-output snapshot, taken *before* P1 (per-activity Temporal options, ADR 0038 (private) §3)
 * touches `buildWorkflowPreamble`/`collectActivityProxyEntries` — a project with no `activityOptions`
 * anywhere must keep compiling byte-for-byte identical output (one `proxyLocalActivities` group, same
 * as today). The fixture below deliberately mirrors several *real* vendors' node shapes (telegram's
 * trigger+action, openai's call-ai-text-style action, http-request's action) the way the rest of this
 * package's tests already do (see `compile-project.test.ts`/`compile-project-questions.test.ts`) —
 * inline `IWorkflowIntegration` fixtures, not an import of the real vendor packages (this package has
 * no dependency on `packages/workflow-integrations/*`).
 */

const telegramIntegration: IWorkflowIntegration = {
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [
    {
      name: 'telegram-trigger',
      label: 'On message',
      notes: 'Fires for every incoming message.',
      scopeType: { type: 'any' },
      scopeVariableName: 'message',
      signalName: 'telegramMessage',
      webhookPath: '/webhooks/telegram/:credentialId/:env',
    },
  ],
  actions: [
    {
      name: 'telegram-send-message',
      label: 'Send message',
      fields: [
        { name: 'credentialId', label: 'Bot', kind: 'credential-ref', vendor: 'telegram' },
        { name: 'chatId', label: 'Chat ID', kind: 'expression' },
        { name: 'text', label: 'Text', kind: 'expression' },
      ],
      emit: (fields) => `await telegramSendMessage(${fields.credentialId}, ${fields.chatId}, ${fields.text});`,
      activityCode: 'export const telegramSendMessage = async () => {};',
      activitySignature: 'telegramSendMessage(credentialId: string, chatId: string, text: string): Promise<void>',
    },
  ],
};

const openaiIntegration: IWorkflowIntegration = {
  vendor: 'openai',
  label: 'OpenAI-compatible',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [
    {
      name: 'call-ai-text',
      label: 'Ask AI (text)',
      fields: [
        { name: 'credentialId', label: 'Integration', kind: 'credential-ref', vendor: 'openai' },
        { name: 'prompt', label: 'Prompt', kind: 'template-string' },
        { name: 'resultVariable', label: 'Result', kind: 'new-variable' },
      ],
      emit: (fields) => `const ${fields.resultVariable} = await callAiText(${fields.credentialId}, ${fields.prompt});`,
      activityCode: 'export const callAiText = async () => "answer";',
      activitySignature: 'callAiText(credentialId: string, prompt: string): Promise<string>',
    },
  ],
};

const httpRequestIntegration: IWorkflowIntegration = {
  vendor: 'http-request',
  label: 'HTTP request',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [
    {
      name: 'http-request',
      label: 'HTTP request',
      fields: [
        { name: 'url', label: 'URL', kind: 'template-string' },
        { name: 'resultVariable', label: 'Result', kind: 'new-variable' },
      ],
      emit: (fields) => `const ${fields.resultVariable} = await httpRequest(${fields.url});`,
      activityCode: 'export const httpRequest = async () => ({ status: 200, body: "" });',
      activitySignature: 'httpRequest(url: string): Promise<{ status: number; body: string }>',
    },
  ],
};

const functionNode = (id: string, bodyChildren: INode[] = []): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: bodyChildren },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const functionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root,
});

const triggerFunctionNode = (id: string, bodyChildren: INode[] = []): INode => ({
  id,
  name: 'trigger-function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    {
      id: `${id}-body`,
      name: 'trigger-function-body',
      data: { vendor: 'telegram', triggerName: 'telegram-trigger', credentialId: 'cred-1' },
      children: bodyChildren,
    },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const triggerFunctionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'trigger-function',
  name,
  root,
});

describe('compileProject snapshot (pre-P1 baseline, no activityOptions)', () => {
  it('compiles a project spanning log + telegram + openai + http-request, one function and one trigger-function', () => {
    const helper = functionNode('doc-helper', [
      {
        id: 'ai1',
        name: 'call-ai-text',
        data: { credentialId: 'cred-openai', prompt: '`Summarize this`', resultVariable: 'summary' },
      },
      { id: 'log1', name: 'log', data: 'summary' },
    ]);

    const trigger = triggerFunctionNode('doc-trigger', [
      {
        id: 'call1',
        name: 'call-function',
        data: { schemeId: 'doc-helper', parameters: [], returnVariable: '' },
      },
      {
        id: 'http1',
        name: 'http-request',
        data: { url: '`https://example.com`', resultVariable: 'response' },
      },
      {
        id: 'send1',
        name: 'telegram-send-message',
        data: { credentialId: 'cred-1', chatId: 'message.chat.id', text: '`done`' },
      },
    ]);

    const result = compileProject({
      documents: [
        functionDocument('doc-helper', 'summarize', helper),
        triggerFunctionDocument('doc-trigger', 'onMessage', trigger),
      ],
      integrations: [telegramIntegration, openaiIntegration, httpRequestIntegration],
    });

    expect(result.workflows).toMatchSnapshot('workflows');
    expect(result.activities).toMatchSnapshot('activities');
  });
});
