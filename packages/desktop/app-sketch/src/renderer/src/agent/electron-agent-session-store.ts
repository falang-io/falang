import type { IAgentSessionStore, IChatSession, IChatSessionSummary, IChatTurn } from '@falang/agent';

/**
 * `IAgentSessionStore` over `globalThis.falang.agentSessions` (ADR 0033 (private))
 * — mirrors `versioning/electron-version-store.ts`'s `ElectronVersionStore` one method to one IPC
 * call, `projectDir` standing in for the workflow client's `projectId`. One instance per open
 * project, held by `DesktopProjectStore.agentChat`.
 */
export class ElectronAgentSessionStore implements IAgentSessionStore {
  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  listSessions(): Promise<IChatSessionSummary[]> {
    return globalThis.falang.agentSessions.list(this.projectDir);
  }

  createSession(title?: string): Promise<IChatSession> {
    return globalThis.falang.agentSessions.create(this.projectDir, title);
  }

  getSession(id: string): Promise<IChatSession | null> {
    return globalThis.falang.agentSessions.get(this.projectDir, id);
  }

  renameSession(id: string, title: string): Promise<void> {
    return globalThis.falang.agentSessions.rename(this.projectDir, id, title);
  }

  deleteSession(id: string): Promise<void> {
    return globalThis.falang.agentSessions.delete(this.projectDir, id);
  }

  appendTurn(sessionId: string, turn: IChatTurn): Promise<void> {
    return globalThis.falang.agentSessions.appendTurn(this.projectDir, sessionId, turn);
  }
}
