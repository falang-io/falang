import { describe, expect, it } from 'vitest';
import {
  buildQuestionHeaderDataSchema,
  buildQuestionNodeConfig,
  getQuestionHeaderFields,
  getQuestionNodeConfigs,
} from './build-question-node-config.js';
import type { IQuestionDescriptor } from './types.js';

const askQuestion: IQuestionDescriptor = {
  name: 'telegram-question',
  label: 'Ask question',
  contextFields: [
    { name: 'credentialId', label: 'Bot', kind: 'credential-ref', vendor: 'telegram' },
    { name: 'chatId', label: 'Chat ID', kind: 'expression' },
  ],
  questionFields: [{ name: 'question', label: 'Question', kind: 'template-string' }],
  answerSignalName: 'telegramQuestionAnswer',
  askActivitySignature:
    'telegramAskQuestion(credentialId: string, chatId: number, question: string, options: readonly string[]): Promise<{ messageId: string }>',
  askActivityCode: '',
  resolveActivitySignature:
    'telegramResolveQuestionAnswer(credentialId: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>',
  resolveActivityCode: '',
};

describe('getQuestionHeaderFields', () => {
  it('concatenates contextFields then questionFields', () => {
    expect(getQuestionHeaderFields(askQuestion).map((field) => field.name)).toEqual([
      'credentialId',
      'chatId',
      'question',
    ]);
  });
});

describe('buildQuestionHeaderDataSchema', () => {
  it('accepts every declared field plus an options string array', () => {
    const schema = buildQuestionHeaderDataSchema(askQuestion);
    const parsed = schema.parse({
      credentialId: 'cred-1',
      chatId: 'message.chat.id',
      question: '`Pick one`',
      options: ['A', 'B'],
    });
    expect(parsed).toEqual({
      credentialId: 'cred-1',
      chatId: 'message.chat.id',
      question: '`Pick one`',
      options: ['A', 'B'],
    });
  });

  it('rejects data missing options', () => {
    const schema = buildQuestionHeaderDataSchema(askQuestion);
    expect(() => schema.parse({ credentialId: '', chatId: '', question: '' })).toThrow();
  });
});

describe('buildQuestionNodeConfig', () => {
  it('produces a header node config with a children policy pointing at the option node', () => {
    const [header] = buildQuestionNodeConfig(askQuestion);
    expect(header.name).toBe('telegram-question');
    expect(header.children).toEqual(['telegram-question-option']);
  });

  it('produces an option node config with children:true and haveOut', () => {
    const [, option] = buildQuestionNodeConfig(askQuestion);
    expect(option.name).toBe('telegram-question-option');
    expect(option.children).toBe(true);
    expect(option.haveOut).toBe(true);
  });

  it('defaults header data to empty fields and 2 placeholder options', () => {
    const [header] = buildQuestionNodeConfig(askQuestion);
    expect(header.data?.default()).toEqual({
      credentialId: '',
      chatId: '',
      question: '',
      options: ['Вариант 1', 'Вариант 2'],
    });
  });

  it('factory seeds 2 default option children matching the default options', () => {
    const [header] = buildQuestionNodeConfig(askQuestion);
    const node = header.factory?.();
    expect(node?.children).toHaveLength(2);
    expect(node?.children?.map((child) => child.name)).toEqual([
      'telegram-question-option',
      'telegram-question-option',
    ]);
    expect(node?.children?.map((child) => child.data)).toEqual([{ label: 'Вариант 1' }, { label: 'Вариант 2' }]);
  });
});

describe('getQuestionNodeConfigs', () => {
  it('flattens header+option configs across every descriptor', () => {
    const configs = getQuestionNodeConfigs([askQuestion]);
    expect(configs.map((config) => config.name)).toEqual(['telegram-question', 'telegram-question-option']);
  });
});

describe('buildQuestionNodeConfig with timeoutField', () => {
  const withTimeout: IQuestionDescriptor = { ...askQuestion, timeoutField: 'timeout' };

  it('appends one extra, fixed option beyond the 2 default ones', () => {
    const [header] = buildQuestionNodeConfig(withTimeout);
    const node = header.factory?.();
    expect(node?.children).toHaveLength(3);
    expect(node?.children?.map((child) => child.data)).toEqual([
      { label: 'Вариант 1' },
      { label: 'Вариант 2' },
      { label: 'timeout', fixed: true },
    ]);
  });

  it('the fixed timeout option validates against the plain (non-typed) option schema', () => {
    const [, option] = buildQuestionNodeConfig(withTimeout);
    expect(() => option.data?.type.parse({ label: 'timeout', fixed: true })).not.toThrow();
  });
});

describe('buildQuestionNodeConfig with optionDataTypes', () => {
  const withTypes: IQuestionDescriptor = { ...askQuestion, optionDataTypes: true };

  it('every default option carries a void dataType', () => {
    const [header] = buildQuestionNodeConfig(withTypes);
    const node = header.factory?.();
    expect(node?.children?.map((child) => child.data)).toEqual([
      { label: 'Вариант 1', dataType: 'void' },
      { label: 'Вариант 2', dataType: 'void' },
    ]);
  });

  it('the option schema accepts a scalar dataType and an optional prompt', () => {
    const [, option] = buildQuestionNodeConfig(withTypes);
    expect(() => option.data?.type.parse({ label: 'Reject', dataType: 'string', prompt: 'Reason' })).not.toThrow();
    expect(() => option.data?.type.parse({ label: 'Bad', dataType: 'not-a-type' })).toThrow();
  });

  it('combines with timeoutField: the fixed option also carries a void dataType', () => {
    const [header] = buildQuestionNodeConfig({ ...withTypes, timeoutField: 'timeout' });
    const node = header.factory?.();
    expect(node?.children?.at(-1)?.data).toEqual({ label: 'timeout', dataType: 'void', fixed: true });
  });
});
