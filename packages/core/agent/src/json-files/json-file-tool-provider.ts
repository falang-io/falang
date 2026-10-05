// oxlint-disable max-lines -- one provider: the four file tools, check_project and their shared plumbing.
import type { INode, NodesStack } from '@falang/dto';
import type { Scheme } from '@falang/scheme';
import type { ILlmToolCall, ILlmToolDefinition } from '../llm-client.js';
import type { IAgentToolProvider } from '../tool-provider.js';
import type { TToolExecutionResult } from '../tool-executor.js';
import { asRecord, fail, ok } from '../tool-result.js';
import { applyTreeToScheme } from './apply-tree-to-scheme.js';
import { prepareDocumentWrite } from './prepare-document-write.js';
import { readSchemeTree, renderDocumentJson, type IJsonDataMapping } from './project-node-tree.js';

/** One editable document as a file. */
export interface IJsonFileDocument {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  /** e.g. `functions/main.json`. */
  readonly path: string;
}

/** A project-level diagnostic (`check_project`), already mapped to a document/node where possible. */
export interface IJsonFilesDiagnostic {
  readonly documentId?: string;
  readonly nodeId?: string;
  readonly message: string;
}

/**
 * What a host supplies so its project can be edited as JSON files (ADR 0062). Product-neutral: the workflow client
 * implements it over `IWorkflowAgentStore`; a desktop host could over its own store.
 */
export interface IJsonFilesHost {
  /** Every document with a node tree the agent may edit, with its file path. */
  listDocuments(): readonly IJsonFileDocument[];
  /** The live scheme of a document (built on demand) — read source and write target. */
  getScheme(documentId: string): Scheme;
  /** Called before a write is applied: lock, open a tab, … Throw to refuse (the message reaches the agent). */
  beforeWrite?(documentId: string): void;
  /** Creates a document for a file path that doesn't exist yet; return its id, or throw with the reason. */
  createDocument?(path: string): string;
  /** Read-only extra files (`NODES.md`, `integrations.json`, …), built on read. */
  readonly extraFiles: Readonly<Record<string, () => string>>;
  /** `schemas/<kind>.json`, or null for an unknown kind. */
  readKindSchema(kind: string): string | null;
  /** Only used to word "allowed: …" lists (vendors without an instance stay valid but unlisted). */
  isListed?(kind: string): boolean;
  /** Two-way `data` mapping between storage and the file (e.g. document references as file paths). */
  readonly dataMapping?: IJsonDataMapping;
  /** Compile + type-check; absent → `check_project` is not offered. */
  checkProject?(): Promise<readonly IJsonFilesDiagnostic[]>;
}

const pathProperty = { description: 'File path, as list_files shows it.', type: 'string' };

const LIST_FILES: ILlmToolDefinition = {
  description:
    "Lists the project as files: one JSON file per document (the document's node tree), plus read-only references — " +
    "NODES.md (node kinds and the rules; read it before writing), schemas/<kind>.json (one node kind's full data schema) " +
    'and others the host adds.',
  inputSchema: { properties: {}, type: 'object' },
  name: 'list_files',
};

const READ_FILE: ILlmToolDefinition = {
  description: "Returns a file's text. Document files are pretty-printed JSON node trees without layout data.",
  inputSchema: { properties: { path: pathProperty }, required: ['path'], type: 'object' },
  name: 'read_file',
};

const WRITE_FILE: ILlmToolDefinition = {
  description:
    'Replaces a document file with `content` (the whole JSON tree) — validated against the node kinds first; nothing ' +
    "is changed on any error, and the error names the node. A path that doesn't exist yet creates the document when " +
    'the host allows it (see NODES.md). Answers with what changed; the file is re-formatted, so read it again before edit_file.',
  inputSchema: {
    properties: { content: { description: 'The complete file text.', type: 'string' }, path: pathProperty },
    required: ['path', 'content'],
    type: 'object',
  },
  name: 'write_file',
};

const EDIT_FILE: ILlmToolDefinition = {
  description:
    'Replaces `old_string` with `new_string` in a document file, then validates and applies the result like write_file. ' +
    '`old_string` must match the CURRENT file text exactly (whitespace included) and only once — copy it from a fresh ' +
    'read_file, include enough surrounding lines to make it unique, or pass `replace_all: true`.',
  inputSchema: {
    properties: {
      new_string: { type: 'string' },
      old_string: { type: 'string' },
      path: pathProperty,
      replace_all: { description: 'Replace every occurrence (default false).', type: 'boolean' },
    },
    required: ['path', 'old_string', 'new_string'],
    type: 'object',
  },
  name: 'edit_file',
};

const CHECK_PROJECT: ILlmToolDefinition = {
  description:
    'Compiles and type-checks the whole project; returns every error with the file and node id it comes from, or ' +
    '`{ "ok": true }`. Call it after changing documents and before finishing.',
  inputSchema: { properties: {}, type: 'object' },
  name: 'check_project',
};

const SCHEMA_PREFIX = 'schemas/';

const countNodes = (node: INode): number =>
  1 +
  (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0) +
  (node.mods ?? []).reduce((sum, mod) => sum + countNodes(mod), 0) +
  (node.out ? countNodes(node.out) : 0);

const findNode = (node: INode, id: string): INode | null => {
  if (node.id === id) return node;
  for (const child of [...(node.children ?? []), ...(node.mods ?? []), ...(node.out ? [node.out] : [])]) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
};

/**
 * The file interface of ADR 0062: `list_files`/`read_file`/`write_file`/`edit_file` (+ `check_project` when the host
 * can compile) over an `IJsonFilesHost`. Writes go through `prepareDocumentWrite` and `applyTreeToScheme` — one undo
 * group per write, nothing applied on any error.
 */
export class JsonFileToolProvider implements IAgentToolProvider {
  readonly tools: readonly ILlmToolDefinition[];
  private readonly host: IJsonFilesHost;

  constructor(host: IJsonFilesHost) {
    this.host = host;
    this.tools = [LIST_FILES, READ_FILE, WRITE_FILE, EDIT_FILE, ...(host.checkProject ? [CHECK_PROJECT] : [])];
  }

  async execute(call: ILlmToolCall): Promise<TToolExecutionResult> {
    const input = asRecord(call.input) ?? {};
    try {
      switch (call.name) {
        case 'list_files': {
          return this.listFiles();
        }
        case 'read_file': {
          return this.readFile(input);
        }
        case 'write_file': {
          return this.writeFile(input);
        }
        case 'edit_file': {
          return this.editFile(input);
        }
        case 'check_project': {
          return await this.checkProject();
        }
        default: {
          return fail(`Unknown tool: ${call.name}`);
        }
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  private findDocument(path: string): IJsonFileDocument | undefined {
    return this.host.listDocuments().find((doc) => doc.path === path);
  }

  private stackOf(documentId: string): NodesStack {
    return this.host.getScheme(documentId).infra.structure;
  }

  /** The document's current tree, as stored (meta included, falsy data dropped by the serializer). */
  private currentTree(documentId: string): INode | null {
    return readSchemeTree(this.host.getScheme(documentId));
  }

  private renderDocument(doc: IJsonFileDocument): string {
    const tree = this.currentTree(doc.id);
    if (!tree) throw new Error(`${doc.path}: the document has no tree`);
    return renderDocumentJson(tree, this.stackOf(doc.id), this.host.dataMapping);
  }

  private listFiles(): TToolExecutionResult {
    const documents = this.host.listDocuments().map((doc) => `${doc.path}  (${doc.type}, writable)`);
    const extras = Object.keys(this.host.extraFiles).map((path) => `${path}  (read-only)`);
    return ok(
      [...documents, ...extras, `${SCHEMA_PREFIX}<kind>.json  (read-only, one per node kind in NODES.md)`].join('\n'),
    );
  }

  private readFile(input: Record<string, unknown>): TToolExecutionResult {
    const path = typeof input.path === 'string' ? input.path : '';
    const extra = this.host.extraFiles[path];
    if (extra) return ok(extra());
    if (path.startsWith(SCHEMA_PREFIX) && path.endsWith('.json')) {
      const kind = path.slice(SCHEMA_PREFIX.length, -'.json'.length);
      const schema = this.host.readKindSchema(kind);
      return schema ? ok(schema) : fail(`${path}: no node kind "${kind}" — see NODES.md`);
    }
    const doc = this.findDocument(path);
    if (!doc) return fail(`${path}: no such file — call list_files`);
    return ok(this.renderDocument(doc));
  }

  private writeFile(input: Record<string, unknown>): TToolExecutionResult {
    const path = typeof input.path === 'string' ? input.path : '';
    if (typeof input.content !== 'string') return fail('write_file: content must be the file text (a string)');
    if (this.host.extraFiles[path] || path.startsWith(SCHEMA_PREFIX)) return fail(`${path} is read-only`);
    let doc = this.findDocument(path);
    if (!doc) {
      if (!this.host.createDocument)
        return fail(`${path}: no such file — documents can't be created by writing a file here`);
      const id = this.host.createDocument(path);
      doc = this.host.listDocuments().find((candidate) => candidate.id === id);
      if (!doc) return fail(`${path}: the document was not created`);
    }
    return this.applyText(doc, input.content);
  }

  private editFile(input: Record<string, unknown>): TToolExecutionResult {
    const path = typeof input.path === 'string' ? input.path : '';
    const { new_string: replacement, old_string: original, replace_all: replaceAll } = input;
    if (typeof original !== 'string' || typeof replacement !== 'string' || original.length === 0) {
      return fail('edit_file: old_string (non-empty) and new_string are required strings');
    }
    const doc = this.findDocument(path);
    if (!doc) return fail(`${path}: no such document file — call list_files`);
    const text = this.renderDocument(doc);
    const occurrences = text.split(original).length - 1;
    if (occurrences === 0) {
      return fail(
        `${path}: old_string was not found. The file is re-formatted after every write — read_file it again and copy the text exactly.`,
      );
    }
    if (occurrences > 1 && replaceAll !== true) {
      return fail(
        `${path}: old_string occurs ${occurrences} times — add surrounding lines to make it unique, or pass replace_all: true.`,
      );
    }
    return this.applyText(
      doc,
      replaceAll === true ? text.split(original).join(replacement) : text.replace(original, () => replacement),
    );
  }

  private applyText(doc: IJsonFileDocument, text: string): TToolExecutionResult {
    const oldRoot = this.currentTree(doc.id);
    const stack = this.stackOf(doc.id);
    const prepared = prepareDocumentWrite({
      dataMapping: this.host.dataMapping,
      documentId: doc.id,
      documentName: doc.name,
      documentType: doc.type,
      isListed: this.host.isListed?.bind(this.host),
      oldRoot,
      stack,
      text,
    });
    if (!prepared.ok) return fail(`${doc.path}: nothing was changed.\n${prepared.error}`);
    this.host.beforeWrite?.(doc.id);
    applyTreeToScheme(this.host.getScheme(doc.id), prepared.root);
    const canonical = renderDocumentJson(prepared.root, stack, this.host.dataMapping);
    return ok(
      JSON.stringify({
        changed: prepared.changes,
        nodes: countNodes(prepared.root),
        ok: true,
        path: doc.path,
        ...(canonical === text
          ? {}
          : { note: 'The file was normalised (ids, formatting) — read_file it before edit_file.' }),
      }),
    );
  }

  private async checkProject(): Promise<TToolExecutionResult> {
    const check = this.host.checkProject;
    if (!check) return fail('check_project is not available here');
    const diagnostics = await check.call(this.host);
    if (diagnostics.length === 0) return ok(JSON.stringify({ ok: true }));
    const documents = this.host.listDocuments();
    const errors = diagnostics.slice(0, 30).map((diagnostic) => {
      const doc = documents.find((candidate) => candidate.id === diagnostic.documentId);
      const tree = doc && diagnostic.nodeId ? this.currentTree(doc.id) : null;
      const node = tree && diagnostic.nodeId ? findNode(tree, diagnostic.nodeId) : null;
      const entry: Record<string, string> = { message: diagnostic.message };
      if (doc) entry.file = doc.path;
      if (diagnostic.nodeId) entry.nodeId = diagnostic.nodeId;
      if (node) entry.kind = node.name;
      return entry;
    });
    return ok(JSON.stringify({ errors, ok: false, total: diagnostics.length }));
  }
}
