import { DEFAULT_CHAT_SESSION_TITLE } from '@falang/agent';
import type { IAgentSessionStore, IChatSession, IChatSessionSummary } from '@falang/agent';

let nextId = 0;
const generateId = (): string => {
  nextId += 1;
  return `session-${nextId}`;
};

/** A minimal in-memory `IAgentSessionStore` for the tests below — no IndexedDB/IPC, just a `Map`. */
export class FakeAgentSessionStore implements IAgentSessionStore {
  private readonly sessions = new Map<string, IChatSession>();

  listSessions(): Promise<IChatSessionSummary[]> {
    return Promise.resolve(
      [...this.sessions.values()].map(({ id, title, createdAt, updatedAt }) => ({ createdAt, id, title, updatedAt })),
    );
  }

  createSession(title = DEFAULT_CHAT_SESSION_TITLE): Promise<IChatSession> {
    const now = new Date().toISOString();
    const session: IChatSession = { createdAt: now, id: generateId(), title, turns: [], updatedAt: now };
    this.sessions.set(session.id, session);
    return Promise.resolve(session);
  }

  getSession(id: string): Promise<IChatSession | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }

  renameSession(id: string, title: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) this.sessions.set(id, { ...session, title });
    return Promise.resolve();
  }

  deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
    return Promise.resolve();
  }

  appendTurn(sessionId: string, turn: IChatSession['turns'][number]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`No session ${sessionId}`);
    this.sessions.set(sessionId, { ...session, turns: [...session.turns, turn], updatedAt: turn.createdAt });
    return Promise.resolve();
  }
}
