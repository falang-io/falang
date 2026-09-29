import { describe, expect, it } from 'vitest';
import {
  buildChoiceHeaderDataSchema,
  buildChoiceNodeConfig,
  getChoiceHeaderFields,
  getChoiceNodeConfigs,
} from './build-choice-node-config.js';
import type { IChoiceDescriptor } from './types.js';

const askChoice: IChoiceDescriptor = {
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
};

describe('getChoiceHeaderFields', () => {
  it('concatenates contextFields then promptFields', () => {
    expect(getChoiceHeaderFields(askChoice).map((field) => field.name)).toEqual(['integration', 'model', 'prompt']);
  });
});

describe('buildChoiceHeaderDataSchema', () => {
  it('accepts every declared field plus an options array of {alias, dataType}', () => {
    const schema = buildChoiceHeaderDataSchema(askChoice);
    const parsed = schema.parse({
      integration: 'cred-1',
      model: 'gpt-4o-mini',
      prompt: '`Pick one`',
      options: [
        { alias: 'A', dataType: { type: 'string' }, variable: 'data' },
        { alias: 'B', dataType: { type: 'number', numberType: { type: 'any' } }, variable: 'data' },
      ],
    });
    expect(parsed).toEqual({
      integration: 'cred-1',
      model: 'gpt-4o-mini',
      prompt: '`Pick one`',
      options: [
        { alias: 'A', dataType: { type: 'string' }, variable: 'data' },
        { alias: 'B', dataType: { type: 'number', numberType: { type: 'any' } }, variable: 'data' },
      ],
    });
  });

  it('rejects data missing options', () => {
    const schema = buildChoiceHeaderDataSchema(askChoice);
    expect(() => schema.parse({ integration: '', model: '', prompt: '' })).toThrow();
  });

  it('rejects an option missing dataType', () => {
    const schema = buildChoiceHeaderDataSchema(askChoice);
    expect(() => schema.parse({ integration: '', model: '', prompt: '', options: [{ alias: 'A' }] })).toThrow();
  });
});

describe('buildChoiceNodeConfig', () => {
  it('produces a header node config with a children policy pointing at the option node', () => {
    const [header] = buildChoiceNodeConfig(askChoice);
    expect(header.name).toBe('call-ai-choice');
    expect(header.children).toEqual(['call-ai-choice-option']);
  });

  it('produces an option node config with children:true and haveOut', () => {
    const [, option] = buildChoiceNodeConfig(askChoice);
    expect(option.name).toBe('call-ai-choice-option');
    expect(option.children).toBe(true);
    expect(option.haveOut).toBe(true);
  });

  it('defaults header data to empty fields and 2 placeholder options, each typed as string', () => {
    const [header] = buildChoiceNodeConfig(askChoice);
    expect(header.data?.default()).toEqual({
      integration: '',
      model: '',
      prompt: '',
      options: [
        { alias: 'Option 1', dataType: { type: 'string' }, variable: 'data' },
        { alias: 'Option 2', dataType: { type: 'string' }, variable: 'data' },
      ],
    });
  });

  it('factory seeds 2 default option children matching the default options', () => {
    const [header] = buildChoiceNodeConfig(askChoice);
    const node = header.factory?.();
    expect(node?.children).toHaveLength(2);
    expect(node?.children?.map((child) => child.name)).toEqual(['call-ai-choice-option', 'call-ai-choice-option']);
    expect(node?.children?.map((child) => child.data)).toEqual([
      { alias: 'Option 1', dataType: { type: 'string' }, variable: 'data' },
      { alias: 'Option 2', dataType: { type: 'string' }, variable: 'data' },
    ]);
  });
});

describe('getChoiceNodeConfigs', () => {
  it('flattens header+option configs across every descriptor', () => {
    const configs = getChoiceNodeConfigs([askChoice]);
    expect(configs.map((config) => config.name)).toEqual(['call-ai-choice', 'call-ai-choice-option']);
  });
});
