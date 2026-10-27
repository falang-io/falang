import { BadRequestException } from '@nestjs/common';
import type { AgentChatRequestDto } from './dto/agent-chat-request.dto.js';

/*
 * Request-size limits for `POST /projects/:id/agent/chat` (security audit P1-2). The client sends the whole
 * conversation on every step and the JSON-files interface reads documents whole, so the numbers leave room for
 * real runs: a ~128k-token model context is ~500k characters, hence one message may be 400k characters and the
 * whole request 1.5M (a long history of tool results that the model itself could not take anyway). Messages: a
 * run is capped at 40 steps by default (`DEFAULT_MAX_STEPS`), a few messages each, so 500 is generous.
 */
export const AGENT_CHAT_MAX_MESSAGES = 500;
export const AGENT_CHAT_MAX_TOOLS = 100;
/** Characters in one message's text (user/assistant content, one tool result, one tool call's arguments). */
export const AGENT_CHAT_MAX_CONTENT_CHARS = 400_000;
/** Characters in the system prompt. */
export const AGENT_CHAT_MAX_SYSTEM_CHARS = 400_000;
/** Characters in one tool definition (description + JSON Schema). */
export const AGENT_CHAT_MAX_TOOL_CHARS = 50_000;
/** Characters in the whole request (system + messages + tools). */
export const AGENT_CHAT_MAX_TOTAL_CHARS = 1_500_000;

const textLength = (value: unknown): number => {
  if (typeof value === 'string') return value.length;
  if (value === null) return 0;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

const tooLong = (what: string, size: number, limit: number): BadRequestException =>
  new BadRequestException(`Agent request is too large: ${what} is ${size} characters, the limit is ${limit}`);

/** Throws a 400 naming the offending part when the request exceeds the limits above; runs before any vendor/sink call. */
export const assertAgentChatRequestSize = (body: AgentChatRequestDto): void => {
  const check = (what: string, size: number, limit: number): void => {
    if (size > limit) throw tooLong(what, size, limit);
  };
  check('the system prompt', textLength(body.system), AGENT_CHAT_MAX_SYSTEM_CHARS);
  let total = textLength(body.system);
  for (const [index, message] of body.messages.entries()) {
    const record = message as unknown as Record<string, unknown>;
    // user/assistant text + an assistant's tool-call arguments + tool results
    const size = textLength(record.content) + textLength(record.toolCalls) + textLength(record.results);
    check(`message #${index + 1}`, size, AGENT_CHAT_MAX_CONTENT_CHARS);
    total += size;
  }
  for (const [index, tool] of body.tools.entries()) {
    const size = textLength(tool);
    check(`tool #${index + 1}`, size, AGENT_CHAT_MAX_TOOL_CHARS);
    total += size;
  }
  check('the request', total, AGENT_CHAT_MAX_TOTAL_CHARS);
};
