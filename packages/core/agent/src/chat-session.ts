import type { IAgentQuestion } from './ask-user.js';
import type { IAgentStep, IAgentUsageTotal } from './agent-session.js';

/** One user message + the run it produced, as persisted inside a chat session. */
export interface IChatTurn {
  readonly id: string;
  /** Which open document's `AgentSession` executed this turn's tool calls — display-only, sessions aren't
   *  scoped by document (see `IAgentSessionStore`). Null when no document was open (e.g. a plain-text reply). */
  readonly documentId: string | null;
  readonly request: string;
  readonly steps: readonly IAgentStep[];
  readonly message: string;
  readonly status: 'done' | 'error' | 'awaiting-answer';
  readonly error?: string;
  /** Set on an `'awaiting-answer'` turn: the clarifying question the run ended with (ADR 0047). */
  readonly question?: IAgentQuestion;
  /** Set on a turn whose request is the answer to an earlier `'awaiting-answer'` turn (that turn's id). */
  readonly answersTurnId?: string;
  /** Token usage summed over this turn's LLM calls; absent when the vendor reported none. */
  readonly usage?: IAgentUsageTotal;
  readonly createdAt: string;
}

/** Session metadata without its (potentially large) turn history — what a session list/picker needs. */
export interface IChatSessionSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IChatSession extends IChatSessionSummary {
  readonly turns: readonly IChatTurn[];
}

/** The title `IAgentSessionStore.createSession()` gives a session when none is passed. Until its first turn,
 *  a session still carrying it is renamed after the first request (see `@falang/antd`'s `AgentChatSessionStore`). */
export const DEFAULT_CHAT_SESSION_TITLE = 'New session';

/**
 * Host-supplied persistence for agent chat sessions — one per project, independent of which document is
 * currently open (a project's sessions all show up in the same picker regardless of which document each of
 * their turns happened to run against). Plain data, no React/MobX in the interface itself, so hosts with no
 * UI dependency (e.g. a desktop main process) can implement it too.
 */
export interface IAgentSessionStore {
  listSessions: () => Promise<IChatSessionSummary[]>;
  /** Without `title`, the session is named `DEFAULT_CHAT_SESSION_TITLE`. */
  createSession: (title?: string) => Promise<IChatSession>;
  getSession: (id: string) => Promise<IChatSession | null>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  appendTurn: (sessionId: string, turn: IChatTurn) => Promise<void>;
}
