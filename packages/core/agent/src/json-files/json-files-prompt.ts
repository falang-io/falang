import type { IAgentContextProvider, IAgentRunContext } from '../context-provider.js';
import type { IJsonFilesHost } from './json-file-tool-provider.js';

/**
 * The base system prompt of the file interface (ADR 0062), replacing the node tools' text: how the project maps to
 * files, the read → write loop, what a write error means, and the two kinds of string fields.
 */
export const JSON_FILES_SYSTEM_PROMPT = [
  'You edit a project made of documents. Each document is a JSON file holding its tree of typed nodes, and you work ' +
    'with files: list_files, read_file, write_file, edit_file. Read NODES.md once before your first write — it lists ' +
    "the node kinds, where statements go, every kind's data shape and the structural rules; schemas/<kind>.json has " +
    "a kind's full data schema when the one-line shape is not enough.",
  'To change a document, read its file, then write the whole new tree with write_file, or replace an exact part of ' +
    'it with edit_file. Keep the "id" of every node you keep; a new node needs no id. Every write is validated as a ' +
    'whole: on an error nothing changes and the message names the node and what is wrong — fix it and write again. ' +
    'Prefer one write per document over many small edits.',
  'String fields that hold code — conditions, expressions, action bodies — are real TypeScript. Fields NODES.md marks ' +
    '(template) are the body of a template literal: plain text with `${expr}` for values, never wrapped in backticks ' +
    'or quotes.',
  'Finish every run by calling the `finish` tool with a direct, first-person reply to the user — the message they ' +
    'will read in the chat, not a report about what you did.',
].join('\n\n');

/** Names the open document by its file path and lists the document files (the file interface's project context). */
export class JsonFilesContextProvider implements IAgentContextProvider {
  private readonly host: IJsonFilesHost;

  constructor(host: IJsonFilesHost) {
    this.host = host;
  }

  describe(context: IAgentRunContext): string {
    const documents = this.host.listDocuments();
    const open = documents.find((doc) => doc.id === context.activeDocumentId);
    const openLine = open
      ? `The user has ${open.path} open in the editor — "this document"/"here" means it.`
      : 'No document is open in the editor.';
    const files = documents.length > 0 ? documents.map((doc) => `- ${doc.path}`).join('\n') : '(no documents yet)';
    return `${openLine}\nDocument files:\n${files}`;
  }
}
