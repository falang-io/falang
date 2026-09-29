import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { buildChoiceEmitters } from './choice-emitters.js';
import { compileStatements } from './node-emitters.js';

/** None of these tests exercise `call-function`, so this should never actually be invoked. */
const noResolveFunctionName = (): string => {
  throw new Error('resolveFunctionName should not be called in these tests');
};

const openaiIntegration: IWorkflowIntegration = {
  vendor: 'openai',
  label: 'OpenAI-compatible',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  choices: [
    {
      name: 'call-ai-choice',
      label: 'Ask AI (choice)',
      contextFields: [
        { name: 'integration', label: 'Integration', kind: 'credential-ref', vendor: 'openai' },
        { name: 'model', label: 'Model', kind: 'select', vendor: 'openai' },
      ],
      promptFields: [{ name: 'prompt', label: 'Prompt', kind: 'template-string' }],
      activitySignature:
        'callAiChoice(credentialId: string, model: string, prompt: string, schema: unknown): Promise<{ action: string; data: unknown }>',
      activityCode: '',
    },
  ],
};

const choiceNode = (
  id: string,
  options: readonly {
    readonly alias: string;
    readonly dataType: TVariableInfo;
    readonly variable?: string;
    readonly children?: INode[];
  }[],
): INode => ({
  id,
  name: 'call-ai-choice',
  data: { integration: 'cred-1', model: 'gpt-4o-mini', prompt: 'Pick one' },
  children: options.map((option, index) => ({
    id: `${id}-option-${index}`,
    name: 'call-ai-choice-option',
    data: { alias: option.alias, dataType: option.dataType, variable: option.variable ?? 'data' },
    children: option.children ?? [],
  })),
});

describe('buildChoiceEmitters', () => {
  it("compiles a single call followed by a switch, binding `data` cast to each branch's declared type", () => {
    const choiceEmitters = buildChoiceEmitters([openaiIntegration]);
    const node = choiceNode('c1', [
      { alias: 'Yes', dataType: { type: 'string' }, children: [{ id: 'log-yes', name: 'log', data: 'picked yes' }] },
      {
        alias: 'No',
        dataType: { type: 'number', numberType: { type: 'any' } },
        children: [{ id: 'log-no', name: 'log', data: 'picked no' }],
      },
    ]);

    const result = compileStatements([node], noResolveFunctionName, {}, choiceEmitters);

    const schema = JSON.stringify({
      anyOf: [
        {
          type: 'object',
          properties: { action: { type: 'string', enum: ['Yes'] }, data: { type: 'string' } },
          required: ['action', 'data'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { action: { type: 'string', enum: ['No'] }, data: { type: 'number' } },
          required: ['action', 'data'],
          additionalProperties: false,
        },
      ],
    });

    expect(result).toBe(
      [
        '// icon-start:call-ai-choice:c1',
        `const c_c1Result = await callAiChoice("cred-1", "gpt-4o-mini", \`Pick one\`, ${schema});`,
        'switch (c_c1Result.action) {',
        '  case "Yes": {',
        '    const data = c_c1Result.data as string;',
        '    // icon-start:log:log-yes',
        '    await logActivity(`picked yes`);',
        '    // icon-end:log:log-yes',
        '    break;',
        '  }',
        '  case "No": {',
        '    const data = c_c1Result.data as number;',
        '    // icon-start:log:log-no',
        '    await logActivity(`picked no`);',
        '    // icon-end:log:log-no',
        '    break;',
        '  }',
        '  default: {',
        '    throw new Error(`Unexpected choice action: ${c_c1Result.action}`);',
        '  }',
        '}',
        '// icon-end:call-ai-choice:c1',
      ].join('\n'),
    );
  });

  it('sanitizes node ids containing "-" into valid JS identifiers, unique per node instance', () => {
    const choiceEmitters = buildChoiceEmitters([openaiIntegration]);
    const node = choiceNode('abc-123-xyz', [{ alias: 'Only', dataType: { type: 'string' } }]);

    const result = compileStatements([node], noResolveFunctionName, {}, choiceEmitters);

    expect(result).toContain('c_abc_123_xyzResult');
  });

  it("binds the branch's declared data to the option's own `variable` name, not a hardcoded `data`", () => {
    const choiceEmitters = buildChoiceEmitters([openaiIntegration]);
    const node = choiceNode('c4', [{ alias: 'Yes', dataType: { type: 'string' }, variable: 'picked' }]);

    const result = compileStatements([node], noResolveFunctionName, {}, choiceEmitters);

    expect(result).toContain('const picked = c_c4Result.data as string;');
  });

  it('produces a bare `const data = ...;\\nbreak;` for an option with no branch statements', () => {
    const choiceEmitters = buildChoiceEmitters([openaiIntegration]);
    const node = choiceNode('c2', [{ alias: 'Empty', dataType: { type: 'boolean' } }]);

    const result = compileStatements([node], noResolveFunctionName, {}, choiceEmitters);

    expect(result).toContain('case "Empty": {\n    const data = c_c2Result.data as boolean;\n    break;\n  }');
  });

  it('throws a clear error when an option declares a non-scalar (e.g. struct) data type', () => {
    const choiceEmitters = buildChoiceEmitters([openaiIntegration]);
    const node = choiceNode('c3', [{ alias: 'Bad', dataType: { type: 'struct', id: 'some/Struct' } }]);

    expect(() => compileStatements([node], noResolveFunctionName, {}, choiceEmitters)).toThrow(
      /only string\/number\/boolean/,
    );
  });

  it('only registers emitters for descriptors actually present in the given integrations', () => {
    const emitters = buildChoiceEmitters([{ ...openaiIntegration, choices: [] }]);
    expect(Object.keys(emitters)).toEqual([]);
  });
});
