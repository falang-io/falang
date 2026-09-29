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
  readonly status: 'done' | 'error';
  readonly error?: string;
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

/**
 * Host-supplied persistence for agent chat sessions — one per project, independent of which document is
 * currently open (a project's sessions all show up in the same picker regardless of which document each of
 * their turns happened to run against). Plain data, no React/MobX in the interface itself, so hosts with no
 * UI dependency (e.g. a desktop main process) can implement it too.
 */
export interface IAgentSessionStore {
  listSessions: () => Promise<IChatSessionSummary[]>;
  createSession: (title?: string) => Promise<IChatSession>;
  getSession: (id: string) => Promise<IChatSession | null>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  appendTurn: (sessionId: string, turn: IChatTurn) => Promise<void>;
}
