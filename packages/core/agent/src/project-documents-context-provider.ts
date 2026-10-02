import type { IAgentContextProvider, IAgentRunContext } from './context-provider.js';

/** The minimum a host needs to expose about one of its documents for `ProjectDocumentsContextProvider`. */
export interface IProjectDocumentSummary {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  /** Optional folder path the host wants shown (e.g. `Functions/Telegram`); rendered as `in <path>`. */
  readonly path?: string;
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
  private readonly getExtraLines?: () => readonly string[];

  /** `getExtraLines` — optional host-supplied lines appended after the document list (e.g. the project's
   *  fixed sections and their ids, so the model can pick a `folderId`); kept generic here. */
  constructor(getDocuments: () => readonly IProjectDocumentSummary[], getExtraLines?: () => readonly string[]) {
    this.getDocuments = getDocuments;
    this.getExtraLines = getExtraLines;
  }

  describe(_context: IAgentRunContext): string | null {
    const documents = this.getDocuments();
    const extra = this.getExtraLines?.() ?? [];
    const extraText = extra.length > 0 ? `\n${extra.join('\n')}` : '';
    if (documents.length === 0) return `This project has no documents yet.${extraText}`;
    const rows = documents.map((doc) => `- ${doc.id} (${doc.type}) "${doc.name}"${doc.path ? ` in ${doc.path}` : ''}`);
    return `Documents in this project (documentId, type, name):\n${rows.join('\n')}${extraText}`;
  }
}
