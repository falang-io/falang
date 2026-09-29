import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { IAgentSessionStore, IChatSession, IChatSessionSummary, IChatTurn } from '@falang/agent';
import { generateUuid } from '../generate-uuid.js';

interface IAgentSessionsDb extends DBSchema {
  sessions: {
    key: string;
    value: IChatSession & { readonly projectId: string };
    indexes: { 'by-project': string };
  };
}

const DB_NAME = 'falang-agent-sessions';
const STORE_NAME = 'sessions';

const openSessionsDb = (): Promise<IDBPDatabase<IAgentSessionsDb>> =>
  openDB<IAgentSessionsDb>(DB_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('by-project', 'projectId');
    },
  });

const toSummary = (session: IChatSession): IChatSessionSummary => ({
  createdAt: session.createdAt,
  id: session.id,
  title: session.title,
  updatedAt: session.updatedAt,
});

/**
 * `IAgentSessionStore` over the browser's IndexedDB (ADR 0033 (private)) —
 * one shared database for the whole app, one record per session (embedding its full `turns` array —
 * chat sessions are small enough that "whole record per write" is simpler than a separate turns
 * store, mirroring the desktop host's own one-file-per-session design), filtered to the current
 * project via the `by-project` index. No prior IndexedDB usage existed anywhere in this repo.
 */
export class IndexedDbAgentSessionStore implements IAgentSessionStore {
  private readonly projectId: string;
  private dbPromise: Promise<IDBPDatabase<IAgentSessionsDb>> | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  private getDb(): Promise<IDBPDatabase<IAgentSessionsDb>> {
    this.dbPromise ??= openSessionsDb();
    return this.dbPromise;
  }

  async listSessions(): Promise<IChatSessionSummary[]> {
    const db = await this.getDb();
    const sessions = await db.getAllFromIndex(STORE_NAME, 'by-project', this.projectId);
    return sessions.map((session) => toSummary(session));
  }

  async createSession(title = 'New session'): Promise<IChatSession> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const session: IChatSession & { projectId: string } = {
      createdAt: now,
      id: generateUuid(),
      projectId: this.projectId,
      title,
      turns: [],
      updatedAt: now,
    };
    await db.put(STORE_NAME, session);
    return session;
  }

  async getSession(id: string): Promise<IChatSession | null> {
    const db = await this.getDb();
    const session = await db.get(STORE_NAME, id);
    return session && session.projectId === this.projectId ? session : null;
  }

  async renameSession(id: string, title: string): Promise<void> {
    const db = await this.getDb();
    const session = await db.get(STORE_NAME, id);
    if (!session || session.projectId !== this.projectId) return;
    await db.put(STORE_NAME, { ...session, title });
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.getDb();
    const session = await db.get(STORE_NAME, id);
    if (!session || session.projectId !== this.projectId) return;
    await db.delete(STORE_NAME, id);
  }

  async appendTurn(sessionId: string, turn: IChatTurn): Promise<void> {
    const db = await this.getDb();
    const session = await db.get(STORE_NAME, sessionId);
    if (!session || session.projectId !== this.projectId) throw new Error(`No session ${sessionId}`);
    await db.put(STORE_NAME, { ...session, turns: [...session.turns, turn], updatedAt: turn.createdAt });
  }
}
