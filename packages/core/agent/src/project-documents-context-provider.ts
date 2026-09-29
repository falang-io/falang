import type { IAgentContextProvider, IAgentRunContext } from './context-provider.js';

/** The minimum a host needs to expose about one of its documents for `ProjectDocumentsContextProvider`. */
export interface IProjectDocumentSummary {
  readonly id: string;
  readonly type: string;
  readonly name: string;
}

/**
 * Tells the LLM which documents exist in the project (id, type, name) so it can target one with a tool
 * call's optional `documentId` (ADR 0034/0036), without a dedicated read-only tool for it — the project's
 * document list is small enough to just dump into the system prompt up front. Generic over any host's own
 * document listing via a getter, so this package stays ignorant of what a "document" is beyond
 * id/type/name — a host filters (e.g. drops pinned documents) before handing rows to the constructor.
 */
export class ProjectDocumentsContextProvider implements IAgentContextProvider {
  private readonly getDocuments: () => readonly IProjectDocumentSummary[];

  constructor(getDocuments: () => readonly IProjectDocumentSummary[]) {
    this.getDocuments = getDocuments;
  }

  describe(_context: IAgentRunContext): string | null {
    const documents = this.getDocuments();
    if (documents.length === 0) return 'This project has no documents yet.';
    const rows = documents.map((doc) => `- ${doc.id} (${doc.type}) "${doc.name}"`);
    return `Documents in this project (documentId, type, name):\n${rows.join('\n')}`;
  }
}
