// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import type { INode } from '@falang/dto';
import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { filesIntegration } from '@falang/workflow-integrations-files';
import { openaiIntegration } from '@falang/workflow-integrations-openai';
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import type { IWorkflowProjectDocument, IWorkflowProjectInput } from '../workflow-model.js';

export const INTEGRATIONS: readonly IWorkflowIntegration[] = [telegramIntegration, openaiIntegration, filesIntegration];

export const INSTANCES: readonly IIntegrationInstance[] = [
  { fields: {}, id: 'inst-bot', name: 'Support bot', vendor: 'telegram' },
  { fields: {}, id: 'inst-gpt', name: 'Мой GPT', vendor: 'openai' },
];

let counter = 0;
export const id = (): string => {
  counter += 1;
  return `w${counter}`;
};

export const n = (name: string, data?: unknown, children?: INode[], extra: Partial<INode> = {}): INode => ({
  id: id(),
  name,
  ...(data === undefined ? {} : { data }),
  ...(children ? { children } : {}),
  ...extra,
});

export const functionRoot = (body: INode[], data: Record<string, unknown> = { parameters: [] }): INode =>
  n('function', undefined, [n('function-header', ''), n('function-body', data, body), n('function-footer', '')]);

export const triggerRoot = (body: INode[], bodyData: Record<string, unknown>): INode =>
  n('trigger-function', undefined, [
    n('function-header', ''),
    n('trigger-function-body', bodyData, body),
    n('function-footer', ''),
  ]);

export const commandTriggerData = {
  credentialId: 'inst-bot',
  scopeType: { id: 'telegram/Message', type: 'struct' },
  scopeVariableName: 'message',
  triggerConfig: { command: '/start' },
  triggerName: 'telegram-on-command-trigger',
  vendor: 'telegram',
};

export const project = (documents: IWorkflowProjectDocument[]): IWorkflowProjectInput => ({
  documents,
  instances: INSTANCES,
  integrations: INTEGRATIONS,
});
