import { action, makeObservable, observable, runInAction } from 'mobx';
import type {
  AgentSession,
  IAgentSessionStore,
  IChatSession,
  IChatSessionSummary,
  IChatTurn,
  TAgentQuestionAnswer,
  TLlmMessage,
} from '@falang/agent';
import { buildQuestionAnswerText } from '@falang/agent';
import { generateId } from './generate-id.js';
import {
  buildPriorMessages,
  countConsecutiveQuestions,
  readAllowQuestions,
  writeAllowQuestions,
} from './agent-chat-helpers.js';

export { buildPriorMessages, countConsecutiveQuestions } from './agent-chat-helpers.js';

export interface IAgentChatStoreOptions {
  /** `localStorage` key persisting the per-project "Don't ask, just do" toggle. */
  readonly allowQuestionsStorageKey?: string;
}

export interface IAgentChatSendParams {
  /** The project's one `AgentSession` (ADR 0036 (private)) —
   *  every send runs the same session regardless of which tab is active. */
  readonly agentSession: AgentSession;
  /** The document open in the editor at the moment Send was clicked, if it's one the agent can edit —
   *  `null` when nothing is open, which is a perfectly normal thing to send with (ADR 0036's "no home
   *  document" amendment: an empty project is workable). Passed through to `AgentSession.run`'s
   *  `IAgentRunOptions.activeDocumentId`, captured once for the whole run, and recorded on the persisted
   *  `IChatTurn.documentId` as-is. */
  readonly activeDocumentId: string | null;
}

/**
 * Drives `AgentChatPanel` (ADR 0033 (private)) over one host-supplied
 * `IAgentSessionStore` — host-neutral, no IndexedDB/IPC knowledge of its own, mirroring
 * `VersionHistoryStore`'s "MobX store over a host interface" shape. One instance per project: `sessions`
 * lists every chat thread for the project regardless of which document each turn touched; `send()` takes
 * the project's one `AgentSession` (unchanged across tab switches, per ADR 0036) plus the id of whatever
 * document is open at send time (possibly none), rather than owning either itself.
 */
export class AgentChatSessionStore {
  @observable.ref sessions: IChatSessionSummary[] = [];
  @observable.ref activeSession: IChatSession | null = null;
  @observable loading = false;
  @observable sending = false;
  @observable error: string | null = null;
  /** The raw thrown value behind `error` (in-memory only), for `AgentChatPanel`'s `renderError`. */
  @observable.ref rawError: unknown = null;
  /** The in-flight request's text, or `null` when nothing is running — owned by the store (not React
   *  local state) so a panel remount for any reason (tab switch, a project-level sidebar toggling in and
   *  out) loses nothing of an active run's UI (ADR 0036 §2). Set in `send()` right before `run()`, cleared
   *  in its `finally`. */
  @observable pendingRequest: string | null = null;

  /** Raw errors of failed turns by turn id — in-memory only; the persisted `IChatTurn` keeps just the message string. */
  private readonly turnErrors = new Map<string, unknown>();

  /** Whether the agent may ask clarifying questions (ADR 0047); the panel's "Don't ask, just do" toggle is its inverse. */
  @observable allowQuestions = true;

  /** Id of the awaiting turn whose full message list the host's `AgentSession` still holds in memory. */
  private pendingMessagesTurnId: string | null = null;

  private readonly store: IAgentSessionStore;
  private readonly options: IAgentChatStoreOptions;

  constructor(store: IAgentSessionStore, options: IAgentChatStoreOptions = {}) {
    this.store = store;
    this.options = options;
    this.allowQuestions = readAllowQuestions(options.allowQuestionsStorageKey);
    makeObservable(this);
  }

  /** The active session's last turn if it is waiting for the user's answer to a clarifying question. */
  get awaitingTurn(): IChatTurn | null {
    const last = this.activeSession?.turns.at(-1);
    return last?.status === 'awaiting-answer' ? last : null;
  }

  @action setAllowQuestions(value: boolean): void {
    this.allowQuestions = value;
    writeAllowQuestions(this.options.allowQuestionsStorageKey, value);
  }

  /** The original thrown value of a turn that failed in this page's lifetime, or `null` (e.g. a reloaded session). */
  getTurnError(turnId: string): unknown {
    return this.turnErrors.get(turnId) ?? null;
  }

  /** Loads the session list and, if nothing is selected yet, the most recently updated session. */
  async loadSessions(): Promise<void> {
    await this.runMutation(async () => {
      const listed = await this.store.listSessions();
      const sessions = listed.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      runInAction(() => {
        this.sessions = sessions;
      });
      const active = this.activeSession;
      if (!active && sessions.length > 0) await this.selectSession(sessions[0].id);
    });
  }

  async selectSession(id: string): Promise<void> {
    await this.runMutation(async () => {
      const session = await this.store.getSession(id);
      runInAction(() => {
        this.activeSession = session;
      });
    });
  }

  async createSession(title?: string): Promise<void> {
    await this.runMutation(async () => {
      const session = await this.store.createSession(title);
      runInAction(() => {
        this.sessions = [
          { createdAt: session.createdAt, id: session.id, title: session.title, updatedAt: session.updatedAt },
          ...this.sessions,
        ];
        this.activeSession = session;
      });
    });
  }

  async rename(id: string, title: string): Promise<void> {
    await this.runMutation(async () => {
      await this.store.renameSession(id, title);
      runInAction(() => {
        this.sessions = this.sessions.map((summary) => (summary.id === id ? { ...summary, title } : summary));
        if (this.activeSession?.id === id) this.activeSession = { ...this.activeSession, title };
      });
    });
  }

  async deleteSession(id: string): Promise<void> {
    await this.runMutation(async () => {
      await this.store.deleteSession(id);
      runInAction(() => {
        this.sessions = this.sessions.filter((summary) => summary.id !== id);
      });
      if (this.activeSession?.id === id) {
        runInAction(() => {
          this.activeSession = null;
        });
        if (this.sessions.length > 0) await this.selectSession(this.sessions[0].id);
      }
    });
  }

  /**
   * Sends `text`, auto-creating a session first if none is active yet. Runs `params.agentSession` against
   * `params.activeDocumentId` (the document open at send time, or `null` — ADR 0036's "no home document"
   * amendment), then — right after `run()` resolves, before anything else can reset it — reads its
   * `steps`/`message`/`status`/`error` into a persisted `IChatTurn`.
   */
  async send(text: string, params: IAgentChatSendParams): Promise<void> {
    if (!this.activeSession) await this.createSession();
    const session = this.activeSession;
    if (!session) return;
    await this.runTurn(session, text, params, {
      priorMessages: buildPriorMessages(session.turns),
      consecutiveQuestions: 0,
    });
  }

  /** Answers the open clarifying question (ADR 0047): the answer is the next user message of a new run, on the
   *  full in-memory conversation when this page still holds it, else on the condensed history. */
  async answer(answer: TAgentQuestionAnswer, params: IAgentChatSendParams): Promise<void> {
    const session = this.activeSession;
    const last = this.awaitingTurn;
    if (!session || !last) return;
    const held = params.agentSession.pendingMessages;
    const priorMessages =
      held !== null && this.pendingMessagesTurnId === last.id ? [...held] : buildPriorMessages(session.turns);
    await this.runTurn(session, buildQuestionAnswerText(answer), params, {
      priorMessages,
      consecutiveQuestions: countConsecutiveQuestions(session.turns),
      answersTurnId: last.id,
    });
  }

  /** Runs the agent, then persists the outcome as one `IChatTurn` (shared by `send` and `answer`). */
  private async runTurn(
    session: IChatSession,
    text: string,
    params: IAgentChatSendParams,
    run: { priorMessages: TLlmMessage[]; consecutiveQuestions: number; answersTurnId?: string },
  ): Promise<void> {
    runInAction(() => {
      this.sending = true;
      this.pendingRequest = text;
      this.error = null;
      this.rawError = null;
    });
    try {
      const { agentSession } = params;
      await agentSession.run(text, {
        activeDocumentId: params.activeDocumentId,
        allowQuestions: this.allowQuestions,
        consecutiveQuestions: run.consecutiveQuestions,
        priorMessages: run.priorMessages,
      });
      const awaiting = agentSession.status === 'awaiting-answer' && agentSession.question !== null;
      let status: IChatTurn['status'] = 'done';
      if (awaiting) status = 'awaiting-answer';
      else if (agentSession.status === 'error') status = 'error';
      const turn: IChatTurn = {
        createdAt: new Date().toISOString(),
        documentId: params.activeDocumentId,
        id: generateId(),
        message: awaiting ? '' : agentSession.message,
        request: text,
        status,
        steps: agentSession.steps,
        ...(awaiting && agentSession.question ? { question: agentSession.question } : {}),
        ...(run.answersTurnId ? { answersTurnId: run.answersTurnId } : {}),
        ...(agentSession.error ? { error: agentSession.error } : {}),
        ...(agentSession.usage.calls > 0 ? { usage: agentSession.usage } : {}),
      };
      this.pendingMessagesTurnId = awaiting ? turn.id : null;
      if (turn.status === 'error' && agentSession.rawError !== null) {
        this.turnErrors.set(turn.id, agentSession.rawError);
      }
      await this.store.appendTurn(session.id, turn);
      const updatedAt = turn.createdAt;
      runInAction(() => {
        this.activeSession = { ...session, turns: [...session.turns, turn], updatedAt };
        this.sessions = this.sessions.map((summary) =>
          summary.id === session.id ? { ...summary, updatedAt } : summary,
        );
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Failed to send the message';
        this.rawError = error;
      });
    } finally {
      runInAction(() => {
        this.sending = false;
        this.pendingRequest = null;
      });
    }
  }

  @action private setError(error: string | null): void {
    this.error = error;
  }

  /** Shared by every mutating action (mirrors `VersionHistoryStore.runMutation`): clears `error` up front, sets it on failure without rethrowing — the panel's `<Alert>` picks it up either way, and a failed `loadSessions`/`selectSession` shouldn't crash the caller. */
  private async runMutation(mutate: () => Promise<void>): Promise<void> {
    runInAction(() => {
      this.loading = true;
      this.setError(null);
    });
    try {
      await mutate();
    } catch (error) {
      runInAction(() => {
        this.setError(error instanceof Error ? error.message : 'Action failed');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
