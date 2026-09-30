import type { IChatTurn, TLlmMessage } from '@falang/agent';

const describeAwaitingTurn = (turn: IChatTurn): string => {
  const question = turn.question;
  if (!question) return '(asked a question)';
  const options = question.options.map((option) => option.label).join(' / ');
  return `(asked: ${question.question} — options: ${options})`;
};

const describeTurnReply = (turn: IChatTurn): string => {
  if (turn.status === 'done') return turn.message;
  if (turn.status === 'awaiting-answer') return describeAwaitingTurn(turn);
  return `(failed: ${turn.error ?? 'unknown error'})`;
};

/** Condensed prior turns for `AgentSession.run`'s `priorMessages` — the conversational thread only, not the
 *  intermediate tool-call/tool-result messages (the system prompt already resends a fresh tree every run). */
export const buildPriorMessages = (turns: readonly IChatTurn[]): TLlmMessage[] =>
  turns.flatMap((turn): TLlmMessage[] => {
    const content = describeTurnReply(turn);
    return [
      { content: turn.request, role: 'user' },
      { content, role: 'assistant', toolCalls: [] },
    ];
  });

/** How many questions in a row ended in `turns`' last turn: the last awaiting turn plus every earlier awaiting
 *  turn it (transitively) answers (ADR 0047's chain cap). */
export const countConsecutiveQuestions = (turns: readonly IChatTurn[]): number => {
  let current: IChatTurn | null = turns.at(-1) ?? null;
  let count = 0;
  while (current && current.status === 'awaiting-answer') {
    count += 1;
    const answered: string | null = current.answersTurnId ?? null;
    current = answered ? (turns.find((turn) => turn.id === answered) ?? null) : null;
  }
  return count;
};

export const readAllowQuestions = (key: string | undefined): boolean => {
  if (!key || typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(key) !== 'false';
  } catch {
    return true;
  }
};

export const writeAllowQuestions = (key: string | undefined, value: boolean): void => {
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // storage unavailable — the toggle just doesn't persist
  }
};
