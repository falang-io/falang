import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';

const fnDoc = (children: INode[]): IProjectDocument => ({
  id: 'd',
  type: 'function',
  name: 'run',
  root: {
    id: 'd',
    name: 'function',
    children: [
      { id: 'h', name: 'function-header', data: '' },
      { id: 'b', name: 'function-body', data: { parameters: [] }, children },
      { id: 'f', name: 'function-footer', data: '' },
    ],
  },
});

const vendor = (name: string, extra: Partial<IWorkflowIntegration> = {}): IWorkflowIntegration => ({
  vendor: name,
  label: name,
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [
    {
      name: `${name}-action`,
      label: name,
      fields: [],
      emit: () => `await ${name}Action();`,
      activityCode: `export const ${name}Action = async (): Promise<void> => {};`,
      activitySignature: `${name}Action(): Promise<void>`,
    },
  ],
  ...extra,
});

describe('__falangActivityVendors', () => {
  it('maps every used vendor activity (actions, questions, choices) to its vendor and type-checks', () => {
    const tg = vendor('telegram', {
      questions: [
        {
          name: 'telegram-question',
          label: 'Ask',
          contextFields: [],
          questionFields: [],
          answerSignalName: 'answer',
          askActivitySignature: 'telegramAsk(): Promise<void>',
          askActivityCode: 'export const telegramAsk = async (): Promise<void> => {};',
          resolveActivitySignature: 'telegramResolve(): Promise<void>',
          resolveActivityCode: 'export const telegramResolve = async (): Promise<void> => {};',
        },
      ],
    });
    const result = compileProject({
      documents: [
        fnDoc([
          { id: 'a', name: 'telegram-action', data: {} },
          { id: 'b2', name: 'openai-action', data: {} },
        ]),
      ],
      integrations: [tg, vendor('openai'), vendor('unused')],
    });
    expect(result.activities).toContain(
      [
        'export const __falangActivityVendors: Record<string, string> = {',
        "  telegramAction: 'telegram',",
        "  telegramAsk: 'telegram',",
        "  telegramResolve: 'telegram',",
        "  openaiAction: 'openai',",
        '};',
      ].join('\n'),
    );
    expect(result.activities).not.toContain('logActivity: ');
  });

  it('emits an empty map when no vendor is used', () => {
    const result = compileProject({ documents: [fnDoc([])], integrations: [vendor('x')] });
    expect(result.activities).toContain('export const __falangActivityVendors: Record<string, string> = {\n};');
  });
});
