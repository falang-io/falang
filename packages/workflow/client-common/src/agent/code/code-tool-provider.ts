// oxlint-disable no-undefined, init-declarations, max-classes-per-file, no-map-spread, no-array-callback-reference, catch-error-name, prefer-string-raw, max-lines, no-console, complexity, no-non-null-assertion, no-use-before-define, require-array-join-separator -- spike code (ADR 0061 (private))
import type {
  IAgentContextProvider,
  IAgentToolProvider,
  ILlmToolCall,
  ILlmToolDefinition,
  TToolExecutionResult,
} from '@falang/agent';
import { canonicalKey, collectIds, ProjectionError } from '@falang/code-projection';
import { resolveService } from '@falang/di';
import type { INode } from '@falang/dto';
import { CMD_DELETE_NODE, CMD_INSERT_NODE, CMD_SET_DATA, TOKEN_HISTORY, type Scheme } from '@falang/scheme';
import type { TTriggerFunctionBodyData } from '@falang/workflow-dto';
import {
  vendorNamespace,
  WorkflowProjection,
  type IWorkflowProjectDocument,
  type IWriteResult,
} from '@falang/workflow-code-projection';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { getIntegrationInstances } from '../../integration-instances.js';
import type { IWorkflowAgentStore } from '../workflow-agent-store.js';

const ok = (content: string): TToolExecutionResult => ({ content, ok: true });
const fail = (error: string): TToolExecutionResult => ({ error, ok: false });

const asRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;

const PATH = { description: 'File path as list_files shows it, e.g. "functions/greetUser.ts".', type: 'string' };

export const CODE_TOOLS: readonly ILlmToolDefinition[] = [
  {
    description:
      'Read-only. Lists the project files: functions/*.ts and triggers/*.ts (one per document, writable) and the generated, read-only falang.d.ts, vendors.d.ts, integrations.ts, types.d.ts.',
    inputSchema: { properties: {}, type: 'object' },
    name: 'list_files',
  },
  {
    description: "Read-only. Returns a file's full text.",
    inputSchema: { properties: { path: PATH }, required: ['path'], type: 'object' },
    name: 'read_file',
  },
  {
    description:
      'Writes a whole function or trigger file; a path that does not exist yet creates the document (functions/<camelCaseName>.ts, ' +
      'triggers/<camelCaseName>.ts). The file is type-checked against the other files and turned into the diagram; on any error ' +
      'nothing is saved and you get every problem as file:line:column — fix them and write again.',
    inputSchema: {
      properties: { content: { description: 'The complete file text.', type: 'string' }, path: PATH },
      required: ['path', 'content'],
      type: 'object',
    },
    name: 'write_file',
  },
  {
    description:
      'Replaces `old_string` with `new_string` in a file and saves it exactly like write_file. `old_string` must occur exactly once ' +
      '(include enough surrounding lines), unless `replace_all` is true. Prefer it to write_file for small changes.',
    inputSchema: {
      properties: {
        new_string: { type: 'string' },
        old_string: { type: 'string' },
        path: PATH,
        replace_all: { type: 'boolean' },
      },
      required: ['path', 'old_string', 'new_string'],
      type: 'object',
    },
    name: 'edit_file',
  },
];

export interface ICodeToolProviderDeps {
  readonly store: IWorkflowAgentStore;
  readonly integrations: readonly IWorkflowIntegration[];
  /** The host's document lock (ADR 0034), taken before a document is changed. */
  readonly acquireLock?: (documentId: string) => void;
  /** "Make sure this document has a tab" cue, before it is changed. */
  readonly onOpenDocument?: (documentId: string) => void;
}

const TREE_TYPES = new Set(['function', 'trigger-function', 'objects-structure']);

/** The project as the projection sees it right now — documents' trees as the editor keeps them in sync. */
export const buildProjection = (
  store: IWorkflowAgentStore,
  integrations: readonly IWorkflowIntegration[],
): WorkflowProjection => {
  const documents: IWorkflowProjectDocument[] = store.documents
    .filter((doc) => TREE_TYPES.has(doc.type))
    .map((doc) => ({ id: doc.id, name: doc.name, root: doc.data ?? null, type: doc.type }));
  return new WorkflowProjection({ documents, instances: getIntegrationInstances(store.documents), integrations });
};

const formatDiagnostics = (error: ProjectionError): string =>
  error.diagnostics.map((d) => `${d.file}:${d.line}:${d.column} ${d.message}`).join('\n');

/** Same statements, same ids (layout meta rides on the ids) — then the body is left alone. */
const sameBody = (before: INode | undefined, after: INode): boolean =>
  before !== undefined &&
  canonicalKey(before) === canonicalKey(after) &&
  [...collectIds(before)].toSorted().join() === [...collectIds(after)].toSorted().join();

/**
 * The in-app agent's file tools over the code projection (ADR 0061): `list_files`, `read_file`, `write_file`,
 * `edit_file`. A write runs `WorkflowProjection.writeFile` (syntax → structure → types → tree → id matching →
 * validation) and applies the resulting tree to the document's live `Scheme` as one undo group, through the command
 * bus: data of the header/body/footer is set, the body's statements are replaced (delete + insert, ids and layout
 * meta carried on the nodes) — only when they changed.
 */
export class CodeToolProvider implements IAgentToolProvider {
  readonly tools: readonly ILlmToolDefinition[] = CODE_TOOLS;
  private readonly deps: ICodeToolProviderDeps;

  constructor(deps: ICodeToolProviderDeps) {
    this.deps = deps;
  }

  private projection(): WorkflowProjection {
    return buildProjection(this.deps.store, this.deps.integrations);
  }

  execute(call: ILlmToolCall): TToolExecutionResult {
    const input = asRecord(call.input) ?? {};
    const path = typeof input.path === 'string' ? input.path.trim() : '';
    try {
      switch (call.name) {
        case 'list_files': {
          return ok(
            JSON.stringify(
              this.projection()
                .listFiles()
                .map(({ path: file, writable }) => ({ path: file, writable })),
            ),
          );
        }
        case 'read_file': {
          return ok(this.projection().readFile(path));
        }
        case 'write_file': {
          if (typeof input.content !== 'string') return fail('write_file: `content` must be the file text');
          return this.write(path, input.content);
        }
        case 'edit_file': {
          return this.edit(path, input);
        }
        default: {
          return fail(`Unknown tool: ${call.name}`);
        }
      }
    } catch (error) {
      if (error instanceof ProjectionError) return fail(formatDiagnostics(error));
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  private edit(path: string, input: Record<string, unknown>): TToolExecutionResult {
    const oldString = input.old_string;
    const newString = input.new_string;
    if (typeof oldString !== 'string' || typeof newString !== 'string' || oldString === '') {
      return fail('edit_file: `old_string` (non-empty) and `new_string` are required strings');
    }
    const text = this.projection().readFile(path);
    const count = text.split(oldString).length - 1;
    if (count === 0)
      return fail(`edit_file: \`old_string\` was not found in ${path}. Read the file again and copy the text exactly.`);
    if (count > 1 && input.replace_all !== true) {
      return fail(
        `edit_file: \`old_string\` occurs ${count} times in ${path}; add surrounding lines to make it unique, or set replace_all.`,
      );
    }
    return this.write(
      path,
      input.replace_all === true ? text.replaceAll(oldString, newString) : text.replace(oldString, newString),
    );
  }

  private write(path: string, content: string): TToolExecutionResult {
    const projection = this.projection();
    const result = projection.writeFile(path, content);
    const documentId = result.documentId ?? this.create(result);
    this.deps.onOpenDocument?.(documentId);
    this.deps.acquireLock?.(documentId);
    const oldRoot = projection.findDocument(path)?.root ?? undefined;
    this.apply(this.deps.store.getScheme(documentId), result.root, oldRoot ?? undefined, Boolean(result.documentId));
    const stored = this.projection().readFile(path);
    const summary = `Saved ${path}${result.documentId ? '' : ' (new document)'}: ${result.stats.kept + result.stats.fresh} nodes, ${result.stats.fresh} new.`;
    return ok(stored.trim() === content.trim() ? summary : `${summary} The file is stored as:\n${stored}`);
  }

  private create(result: IWriteResult): string {
    if (result.type === 'function') return this.deps.store.createDocument('function', result.name);
    if (result.type === 'objects-structure') return this.deps.store.createDocument('objects-structure', result.name);
    if (!result.triggerBody) throw new Error('A new trigger file must bind a trigger');
    return this.deps.store.createTriggerFunctionDocument(result.name, result.triggerBody as TTriggerFunctionBodyData);
  }

  /** Puts `root` into the live scheme: one undo group, through the commands every edit uses. */
  private apply(scheme: Scheme, root: INode, oldRoot: INode | undefined, existed: boolean): void {
    const live = scheme.rootNode;
    if (!live) throw new Error('The document has no tree');
    const history = scheme.container.isRegistered(TOKEN_HISTORY, true)
      ? resolveService(TOKEN_HISTORY, scheme.container)
      : null;
    const run = (): void => {
      root.children?.forEach((part, index) => {
        const target = live.children[index];
        if (!target) return;
        if (JSON.stringify(target.data ?? null) !== JSON.stringify(part.data ?? null)) {
          scheme.commands.dispatchCommand(CMD_SET_DATA, { data: part.data, id: target.id });
        }
        if (index !== 1) return;
        if (existed && sameBody(oldRoot?.children?.[1], part)) return;
        for (const child of target.children.map((node) => node.id))
          scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: child });
        for (const [position, node] of (part.children ?? []).entries()) {
          scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: position, node, parentId: target.id });
        }
      });
    };
    if (history) history.runGrouped(run);
    else run();
  }
}

/** The file list, so the model starts from paths instead of a `list_files` round trip. */
export class CodeFilesContextProvider implements IAgentContextProvider {
  private readonly deps: Pick<ICodeToolProviderDeps, 'store' | 'integrations'>;

  constructor(deps: Pick<ICodeToolProviderDeps, 'store' | 'integrations'>) {
    this.deps = deps;
  }

  describe(): string {
    const files = buildProjection(this.deps.store, this.deps.integrations).listFiles();
    return `Project files:\n${files.map((file) => `- ${file.path}${file.writable ? '' : ' (read-only)'}`).join('\n')}`;
  }
}

/** "In code: `supportBot` (telegram) — methods: sendMessage, askQuestion, onMessage, …" for a just-created instance. */
export const describeInstanceForCode = (
  store: IWorkflowAgentStore,
  integrations: readonly IWorkflowIntegration[],
  instanceId: string,
): string | undefined => {
  const projection = buildProjection(store, integrations);
  const entry = projection.model.instanceById(instanceId);
  if (!entry) return undefined;
  const vendors = projection.readFile('vendors.d.ts');
  const block = vendors.slice(
    vendors.indexOf(
      `interface Instance {`,
      vendors.indexOf(`declare namespace ${vendorNamespace(entry.integration.vendor)}`),
    ),
  );
  const methods = [...block.slice(0, block.indexOf('\n  }')).matchAll(/^\s{4}(\w+)[<(]/gm)].map((match) => match[1]);
  return `In code this instance is the global \`${entry.identifier}\` (integrations.ts); its methods: ${methods.join(', ')} — signatures in vendors.d.ts.`;
};
