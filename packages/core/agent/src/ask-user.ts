import type { ILlmToolCall, ILlmToolDefinition } from './llm-client.js';
import type { TToolExecutionResult } from './tool-result.js';
import { asRecord, decodeJsonString, fail, ok } from './tool-result.js';

export interface IAgentQuestionOption {
  readonly label: string;
  /** One-line consequence of choosing this option. */
  readonly description?: string;
}

/** A clarifying question the agent ended a run with (ADR 0047). */
export interface IAgentQuestion {
  readonly question: string;
  readonly options: readonly IAgentQuestionOption[];
  /** Whether the UI should also offer a free-text answer. */
  readonly allowOther: boolean;
}

/** How many questions in a row the agent may ask before it is told to decide itself. */
export const DEFAULT_MAX_CONSECUTIVE_QUESTIONS = 3;

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

/** Deliberately not part of `AGENT_TOOLS` (mirrored elsewhere) — `AgentSession.run()` appends it when allowed. */
export const ASK_USER_TOOL: ILlmToolDefinition = {
  name: 'ask_user',
  description:
    'Stops the run and asks the user ONE clarifying question. Use it only when the answer materially changes ' +
    'what you would build: which vendor/integration to use, whether to reuse an existing integration instance ' +
    'or create a blank one, where data comes from, the shape of the control flow. Never ask about details that ' +
    'can be filled in later (ids, texts, field values) — build with placeholders and mention them in `finish`. ' +
    'Give 2-4 concrete options, the recommended one first, each with a one-line consequence in `description`. ' +
    "Write the question in the user's own language. Calling this tool ENDS the run — the user's answer arrives " +
    'as the next user message. If the work splits cleanly, do the unambiguous part first; otherwise ask before ' +
    'touching anything.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      options: {
        type: 'array',
        minItems: MIN_OPTIONS,
        maxItems: MAX_OPTIONS,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            description: { type: 'string', description: 'One line: what choosing this option leads to.' },
          },
          required: ['label'],
        },
      },
      allowOther: {
        type: 'boolean',
        description: 'Whether the user may type a free-text answer instead. Defaults to true.',
      },
    },
    required: ['question', 'options'],
  },
};

const isOptional = (value: unknown, type: 'string' | 'boolean'): boolean =>
  value === null || [type, 'undefined'].includes(typeof value);

const parseOptions = (raw: unknown): { options: IAgentQuestionOption[] } | { error: string } => {
  const value = decodeJsonString(raw);
  if (!Array.isArray(value)) return { error: 'ask_user: `options` must be an array of { label, description? }' };
  if (value.length < MIN_OPTIONS || value.length > MAX_OPTIONS) {
    return { error: `ask_user: \`options\` must have ${MIN_OPTIONS}-${MAX_OPTIONS} items, got ${value.length}` };
  }
  const options: IAgentQuestionOption[] = [];
  for (const [index, item] of value.entries()) {
    const record = asRecord(decodeJsonString(item));
    const label = record && typeof record.label === 'string' ? record.label.trim() : '';
    if (!label) return { error: `ask_user: options[${index}].label must be a non-empty string` };
    const description = record?.description;
    if (!isOptional(description, 'string')) {
      return { error: `ask_user: options[${index}].description must be a string` };
    }
    const trimmed = typeof description === 'string' ? description.trim() : '';
    options.push(trimmed ? { description: trimmed, label } : { label });
  }
  return { options };
};

/** Validates an `ask_user` input. Invalid → `fail(...)` (the run continues and the model retries). */
export const executeAskUser = (input: unknown, offered = true): TToolExecutionResult => {
  if (!offered) {
    return fail('ask_user is not available in this run — decide yourself and state your assumptions in finish');
  }
  const params = asRecord(decodeJsonString(input));
  const question = params && typeof params.question === 'string' ? params.question.trim() : '';
  if (!question) return fail('ask_user: `question` must be a non-empty string');
  const parsed = parseOptions(params?.options);
  if ('error' in parsed) return fail(parsed.error);
  if (!isOptional(params?.allowOther, 'boolean')) {
    return fail('ask_user: `allowOther` must be a boolean');
  }
  return ok(JSON.stringify({ asked: true }));
};

/** The question a successful `ask_user` call carries, or `null` for any other call/failed result. */
export const parseAskUserQuestion = (call: ILlmToolCall, result: TToolExecutionResult): IAgentQuestion | null => {
  if (call.name !== 'ask_user' || !result.ok) return null;
  const params = asRecord(decodeJsonString(call.input));
  const parsed = parseOptions(params?.options);
  if (!params || 'error' in parsed) return null;
  return {
    allowOther: params.allowOther !== false,
    options: parsed.options,
    question: String(params.question).trim(),
  };
};

export type TAgentQuestionAnswer =
  | { readonly option: string }
  | { readonly other: string }
  | { readonly decideYourself: true };

/** The user message a host sends as the next `run()`'s request to answer a question. */
export const buildQuestionAnswerText = (answer: TAgentQuestionAnswer): string => {
  if ('option' in answer) return `Answer: ${answer.option}`;
  if ('other' in answer) return `Answer: ${answer.other}`;
  return (
    'Answer: decide yourself — pick what you think is best, go ahead without asking again about this, ' +
    'and state the assumption in your finish message.'
  );
};

export interface IQuestionPolicy {
  readonly offered: boolean;
  readonly allowQuestions: boolean;
  readonly consecutive: number;
  readonly max: number;
}

export const resolveQuestionPolicy = (options: {
  readonly allowQuestions?: boolean;
  readonly maxConsecutiveQuestions?: number;
  readonly consecutiveQuestions?: number;
}): IQuestionPolicy => {
  const allowQuestions = options.allowQuestions ?? true;
  const max = options.maxConsecutiveQuestions ?? DEFAULT_MAX_CONSECUTIVE_QUESTIONS;
  const consecutive = options.consecutiveQuestions ?? 0;
  return { allowQuestions, consecutive, max, offered: allowQuestions && consecutive < max };
};

/** The system-prompt paragraph about clarifying questions. */
export const buildAskUserPrompt = (policy: IQuestionPolicy): string => {
  if (!policy.allowQuestions) {
    return (
      "Don't ask the user questions. When the request is ambiguous, pick the most reasonable option and state " +
      'your assumptions in the `finish` message.'
    );
  }
  if (!policy.offered) {
    return (
      `You have already asked ${policy.consecutive} questions in a row; decide yourself now and state your ` +
      'assumptions in the `finish` message.'
    );
  }
  const parts = [
    'You may call `ask_user` to ask ONE clarifying question, but only when the answer materially changes what ' +
      'you would build (which vendor/integration, reusing an existing integration instance vs creating a blank ' +
      'one, where data comes from, the shape of the control flow). Never ask about details that can be filled ' +
      'in later — build with placeholders and mention them in `finish`. Do the unambiguous part first when the ' +
      "work splits cleanly. Write the question in the user's language. If the previous assistant turn ended " +
      "with an ask_user question, the user's next message (starting with `Answer:`) is the answer to it — " +
      'continue the work accordingly.',
  ];
  if (policy.consecutive > 0) {
    parts.push(
      `You have already asked ${policy.consecutive} question(s) in a row; ask again only if really necessary.`,
    );
  }
  return parts.join(' ');
};
