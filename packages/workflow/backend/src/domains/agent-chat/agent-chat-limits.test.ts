// oxlint-disable max-lines, no-undefined, unicorn/no-useless-undefined, unicorn/catch-error-name, unicorn/no-await-expression-member, init-declarations, no-unsafe-optional-chaining -- test fakes and deferred-promise scaffolding.
import 'reflect-metadata';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AGENT_CHAT_MAX_MESSAGES, AGENT_CHAT_MAX_TOOLS } from './agent-chat-limits.js';
import { AgentChatRequestDto } from './dto/agent-chat-request.dto.js';

const make = (messages: number, tools: number): AgentChatRequestDto =>
  Object.assign(new AgentChatRequestDto(), {
    messages: Array.from({ length: messages }, () => ({ content: 'x', role: 'user' })),
    system: 's',
    tools: Array.from({ length: tools }, () => ({ description: '', inputSchema: {}, name: 't' })),
  });

describe('AgentChatRequestDto size limits', () => {
  it('accepts the maximum', async () => {
    expect(await validate(make(AGENT_CHAT_MAX_MESSAGES, AGENT_CHAT_MAX_TOOLS))).toHaveLength(0);
  });

  it('rejects too many messages, tools or a huge system prompt', async () => {
    expect((await validate(make(AGENT_CHAT_MAX_MESSAGES + 1, 1))).map((e) => e.property)).toEqual(['messages']);
    expect((await validate(make(1, AGENT_CHAT_MAX_TOOLS + 1))).map((e) => e.property)).toEqual(['tools']);
    const big = make(1, 1);
    big.system = 'x'.repeat(400_001);
    expect((await validate(big)).map((e) => e.property)).toEqual(['system']);
  });
});
