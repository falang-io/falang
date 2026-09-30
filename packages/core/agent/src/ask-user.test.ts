import { describe, expect, it } from 'vitest';
import {
  ASK_USER_TOOL,
  buildAskUserPrompt,
  buildQuestionAnswerText,
  executeAskUser,
  parseAskUserQuestion,
  resolveQuestionPolicy,
} from './ask-user.js';
import { describeToolCall } from './describe-tool-call.js';
import { AGENT_TOOLS } from './tools.js';

const valid = { options: [{ description: 'fast', label: 'A' }, { label: 'B' }], question: ' Which? ' };

describe('ask-user helpers', () => {
  it('is not part of AGENT_TOOLS', () => {
    expect(AGENT_TOOLS.some((tool) => tool.name === 'ask_user')).toBe(false);
    expect(ASK_USER_TOOL.name).toBe('ask_user');
  });

  it('validates input', () => {
    expect(executeAskUser(valid)).toEqual({ content: '{"asked":true}', ok: true });
    expect(executeAskUser({ ...valid, options: [{ label: 'A' }] }).ok).toBe(false);
    expect(executeAskUser({ ...valid, options: [{ label: 'A' }, { label: ' ' }] }).ok).toBe(false);
    expect(executeAskUser({ ...valid, question: '  ' }).ok).toBe(false);
    expect(executeAskUser({ ...valid, options: JSON.stringify(valid.options) }).ok).toBe(true);
  });

  it('parses the question, allowOther defaulting to true', () => {
    const call = { id: '1', input: valid, name: 'ask_user' };
    expect(parseAskUserQuestion(call, executeAskUser(valid))).toEqual({
      allowOther: true,
      options: [{ description: 'fast', label: 'A' }, { label: 'B' }],
      question: 'Which?',
    });
    expect(
      parseAskUserQuestion({ ...call, input: { ...valid, allowOther: false } }, executeAskUser(valid))?.allowOther,
    ).toBe(false);
    expect(parseAskUserQuestion(call, { error: 'x', ok: false })).toBeNull();
    expect(parseAskUserQuestion({ ...call, name: 'finish' }, executeAskUser(valid))).toBeNull();
  });

  it('builds answer texts', () => {
    expect(buildQuestionAnswerText({ option: 'A' })).toBe('Answer: A');
    expect(buildQuestionAnswerText({ other: 'free' })).toBe('Answer: free');
    expect(buildQuestionAnswerText({ decideYourself: true })).toContain('decide yourself');
  });

  it('resolves the policy and prompt', () => {
    expect(resolveQuestionPolicy({}).offered).toBe(true);
    expect(resolveQuestionPolicy({ consecutiveQuestions: 3 }).offered).toBe(false);
    expect(resolveQuestionPolicy({ allowQuestions: false }).offered).toBe(false);
    expect(buildAskUserPrompt(resolveQuestionPolicy({ consecutiveQuestions: 3 }))).toContain('decide yourself now');
    expect(buildAskUserPrompt(resolveQuestionPolicy({ consecutiveQuestions: 1 }))).toContain('already asked 1');
    expect(buildAskUserPrompt(resolveQuestionPolicy({ allowQuestions: false }))).toContain("Don't ask");
    expect(buildAskUserPrompt(resolveQuestionPolicy({}))).toContain('Answer:');
  });

  it('describes the call', () => {
    expect(describeToolCall({ id: '1', input: valid, name: 'ask_user' })).toBe('Asked:  Which? ');
  });
});
