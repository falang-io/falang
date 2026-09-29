import { promises as fs } from 'node:fs';
import { nanoid } from 'nanoid';
import type { IChatSession, IChatSessionSummary, IChatTurn } from '@falang/agent';
import { agentSessionPath, agentSessionsDir } from '../paths.js';

/**
 * Desktop persistence for ADR 0033 (private)'s agent chat sessions — one
 * `falang/agent-sessions/<id>.json` file per session, matching the `falang/schemes/<id>.json`
 * per-document precedent (`documents.ts`) rather than a single sidecar blob (`locks.ts`), since
 * sessions — like documents — are numerous and can each grow large. Plain async functions taking
 * `projectDir` first, same shape as `documents.ts`, not a class: there's no per-store state to hold
 * (unlike `GitVersionStore`'s serial queue). Deliberately no serial queue and no `watchProject`
 * integration — chat sessions are never edited from outside the app, so nothing needs to watch for
 * external changes (mirrors `locks.ts`'s own "no queue" precedent).
 */
/** Best-effort read, mirroring `readSidecar`'s own "missing or corrupt → null" posture: a caller distinguishes "no such session" from "unreadable" the same way either way. */
const readSession = async (projectDir: string, id: string): Promise<IChatSession | null> => {
  try {
    const raw = await fs.readFile(agentSessionPath(projectDir, id), 'utf8');
    return JSON.parse(raw) as IChatSession;
  } catch {
    return null;
  }
};

/** Overwrites a session's payload file — full replace, no partial writes, matching `writeDocument`'s own convention. Creates `falang/agent-sessions/` lazily on first write, same as `documentsDir` is created up front by `createProject` but this directory isn't (older projects predate this feature). */
const writeSession = async (projectDir: string, session: IChatSession): Promise<void> => {
  await fs.mkdir(agentSessionsDir(projectDir), { recursive: true });
  await fs.writeFile(agentSessionPath(projectDir, session.id), JSON.stringify(session, null, 2));
};

const toSummary = (session: IChatSession): IChatSessionSummary => ({
  createdAt: session.createdAt,
  id: session.id,
  title: session.title,
  updatedAt: session.updatedAt,
});

/** Missing `agent-sessions/` directory (a project that predates this feature, or simply has no sessions yet) → `[]`, same "absent is empty" posture as `readLocks`. */
export const listSessions = async (projectDir: string): Promise<IChatSessionSummary[]> => {
  // oxlint-disable-next-line init-declarations -- assigned inside the try below, no meaningful default
  let entries: string[];
  try {
    entries = await fs.readdir(agentSessionsDir(projectDir));
  } catch {
    return [];
  }
  const ids = entries.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length));
  const sessions = await Promise.all(ids.map((id) => readSession(projectDir, id)));
  return sessions.filter((session): session is IChatSession => session !== null).map((session) => toSummary(session));
};

export const createSession = async (projectDir: string, title = 'New session'): Promise<IChatSession> => {
  const now = new Date().toISOString();
  const session: IChatSession = { createdAt: now, id: nanoid(), title, turns: [], updatedAt: now };
  await writeSession(projectDir, session);
  return session;
};

export const getSession = (projectDir: string, id: string): Promise<IChatSession | null> => readSession(projectDir, id);

export const renameSession = async (projectDir: string, id: string, title: string): Promise<void> => {
  const session = await readSession(projectDir, id);
  if (!session) throw new Error(`Agent chat session "${id}" not found`);
  await writeSession(projectDir, { ...session, title });
};

export const deleteSession = async (projectDir: string, id: string): Promise<void> => {
  await fs.rm(agentSessionPath(projectDir, id), { force: true });
};

export const appendTurn = async (projectDir: string, sessionId: string, turn: IChatTurn): Promise<void> => {
  const session = await readSession(projectDir, sessionId);
  if (!session) throw new Error(`Agent chat session "${sessionId}" not found`);
  await writeSession(projectDir, { ...session, turns: [...session.turns, turn], updatedAt: turn.createdAt });
};
