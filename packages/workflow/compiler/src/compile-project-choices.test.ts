import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';

const openaiIntegrationWithChoice: IWorkflowIntegration = {
  vendor: 'openai',
  label: 'OpenAI-compatible',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  sharedActivityCode: 'const resolveOpenAiField = async () => "value";',
  choices: [
    {
      name: 'call-ai-choice',
      label: 'Ask AI (choice)',
      contextFields: [{ name: 'integration', label: 'Integration', kind: 'credential-ref', vendor: 'openai' }],
      promptFields: [{ name: 'prompt', label: 'Prompt', kind: 'template-string' }],
      activitySignature:
        'callAiChoice(credentialId: string, prompt: string, schema: unknown): Promise<{ action: string; data: unknown }>',
      activityCode: 'export const callAiChoice = async () => ({ action: "A", data: "x" });',
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

describe('compileProject with choices', () => {
  it('proxies the activity and emits sharedActivityCode once, ahead of it', () => {
    const fn = functionNode('doc-fn', [
      {
        id: 'c1',
        name: 'call-ai-choice',
        data: { integration: 'cred-1', prompt: 'Pick one' },
        children: [
          {
            id: 'c1-option-0',
            name: 'call-ai-choice-option',
            data: { alias: 'A', dataType: { type: 'string' }, variable: 'data' },
            children: [],
          },
        ],
      },
    ]);

    const result = compileProject({
      documents: [functionDocument('doc-fn', 'run', fn)],
      integrations: [openaiIntegrationWithChoice],
    });

    expect(result.workflows).toContain('callAiChoice(credentialId: string, prompt: string, schema: unknown)');
    expect(result.workflows).toContain('switch (c_c1Result.action)');

    const sharedIndex = result.activities.indexOf('const resolveOpenAiField');
    const choiceIndex = result.activities.indexOf('export const callAiChoice');
    expect(sharedIndex).toBeGreaterThanOrEqual(0);
    expect(sharedIndex).toBeLessThan(choiceIndex);
  });
});
