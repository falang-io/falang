// oxlint-disable max-lines -- one cohesive store: run lifecycle, host adapter, confirm and popup-apply
import { action, makeObservable, observable, ObservableMap, runInAction } from 'mobx';
import {
  AgentSession,
  buildQuestionAnswerText,
  type IAgentContextProvider,
  type IAgentDocumentResolver,
  type IAgentNodeKindFilter,
  type IAgentQuestion,
  type IAgentToolProvider,
  type ILlmClient,
  type TAgentQuestionAnswer,
  type TLlmMessage,
} from '@falang/agent';
import type { INode } from '@falang/dto';
import { resolveService } from '@falang/di';
import {
  CMD_DELETE_NODE,
  CMD_INSERT_NODE,
  CMD_SET_DATA,
  CMD_SET_META,
  TOKEN_HISTORY,
  type Scheme,
} from '@falang/scheme';
// Deep import (not the package root): the root pulls in `monaco-editor`, which breaks this package's plain-node Vitest environment.
import {
  TOKEN_MAGIC_HOST,
  type IMagicHost,
  type TMagicRunStatus,
} from '@falang/workflow-scheme/src/magic/magic-host.js';
import { MAGIC_NAME } from '@falang/workflow-dto';
import { buildMagicGeneratePrompt, buildMagicUpdatePrompt, type IMagicPrompt } from './magic-prompts.js';
import { MagicToolProvider } from './magic-tool-provider.js';

export { TOKEN_MAGIC_HOST };

/** Enough for get_node_kinds, a search or two, one write and finish (ADR 0046 (private)). */
export const MAGIC_MAX_STEPS = 12;

export interface IMagicRunState {
  readonly status: TMagicRunStatus;
  readonly error: string | null;
  readonly question: IAgentQuestion | null;
}

const IDLE: IMagicRunState = { error: null, question: null, status: 'idle' };

export interface IMagicRunDeps {
  /** The main scheme of a document (built on demand by the host); `null` when it doesn't exist. */
  readonly getScheme: (documentId: string) => Scheme | null;
  readonly createLlmClient: () => ILlmClient;
  /** Tool providers of a run besides the magic write tool (integrations, `list_types`). */
  readonly createToolProviders: () => IAgentToolProvider[];
  readonly createContextProviders: () => IAgentContextProvider[];
  readonly nodeKindFilter?: IAgentNodeKindFilter;
  /** The chat's persisted "Don't ask, just do" setting, inverted. */
  readonly getAllowQuestions: () => boolean;
}

/** "Update the steps to match the new text?" — rendered by the workspace; the store stays UI-free. */
export interface IMagicConfirm {
  readonly kind: 'update' | 'regenerate';
  /** "Update with AI" / "Regenerate". */
  readonly accept: () => void;
}

/** What the popup's OK writes into the main magic node. */
export interface IMagicEdit {
  readonly spell: string;
  readonly children: INode[];
  /** The popup saw a mutation of the steps. */
  readonly handEdited: boolean;
}

interface IRunContext {
  readonly documentId: string;
  readonly nodeId: string;
  readonly session: AgentSession;
  readonly prompt: IMagicPrompt;
  filled: boolean;
  noted: boolean;
  cancelled: boolean;
  questions: number;
}

const keyOf = (documentId: string, nodeId: string): string => `${documentId}:${nodeId}`;

/**
 * Project-level owner of every magic node's AI run (ADR 0046 (private)): one dedicated `AgentSession` per
 * run (never the chat's), several may run at once. Implements `IMagicHost` per document
 * (`createHost`), and owns the two pieces of UI state the workspace renders: `pendingConfirm` and
 * `openEditor`.
 */
export class MagicRunStore {
  @observable.ref pendingConfirm: IMagicConfirm | null = null;
  @observable.ref openEditor: { documentId: string; nodeId: string } | null = null;

  private readonly states = new ObservableMap<string, IMagicRunState>();
  private readonly contexts = new Map<string, IRunContext>();
  private readonly filling = new Set<string>();
  private readonly deps: IMagicRunDeps;

  constructor(deps: IMagicRunDeps) {
    this.deps = deps;
    makeObservable(this);
  }

  // --- host -----------------------------------------------------------------------------------

  createHost(documentId: string): IMagicHost {
    return {
      getStatus: (nodeId) => this.getState(documentId, nodeId).status,
      isFilling: (nodeId) => this.filling.has(nodeId),
      onSpellCommitted: (nodeId, prev, next) => this.onSpellCommitted(documentId, nodeId, prev, next),
      openEditor: (nodeId) => this.openEditorFor(documentId, nodeId),
    };
  }

  /** Registers the host for one document's scheme. */
  registerHost(documentId: string, scheme: Scheme): void {
    scheme.container.registerInstance(TOKEN_MAGIC_HOST, this.createHost(documentId));
  }

  // --- state ----------------------------------------------------------------------------------

  getState(documentId: string, nodeId: string): IMagicRunState {
    return this.states.get(keyOf(documentId, nodeId)) ?? IDLE;
  }

  /** `true` while a run (generating or asking) still owns the node — the popup is read-only then. */
  isBusy(documentId: string, nodeId: string): boolean {
    const { status } = this.getState(documentId, nodeId);
    return status === 'generating' || status === 'asking';
  }

  @action openEditorFor(documentId: string, nodeId: string): void {
    this.openEditor = { documentId, nodeId };
  }

  @action closeEditor(): void {
    this.openEditor = null;
  }

  @action requestConfirm(confirm: IMagicConfirm): void {
    this.pendingConfirm = confirm;
  }

  /** The confirm dialog's answer: `true` = accept ("Update with AI"), `false` = "Keep as is". */
  @action resolveConfirm(accept: boolean): void {
    const confirm = this.pendingConfirm;
    this.pendingConfirm = null;
    if (accept) confirm?.accept();
  }

  // --- runs -----------------------------------------------------------------------------------

  startGenerate(documentId: string, nodeId: string): void {
    const spell = this.readSpell(documentId, nodeId);
    if (spell === null) return;
    this.start(documentId, nodeId, buildMagicGeneratePrompt({ documentId, nodeId, spell }));
  }

  startUpdate(documentId: string, nodeId: string, previousSpell: string, spell: string): void {
    this.start(documentId, nodeId, buildMagicUpdatePrompt({ documentId, nodeId, previousSpell, spell }));
  }

  /** The user's answer to an open question: continues the same conversation (ADR 0047). */
  answer(documentId: string, nodeId: string, answer: TAgentQuestionAnswer): void {
    const context = this.contexts.get(keyOf(documentId, nodeId));
    const prior = context?.session.pendingMessages;
    if (!context || !prior) return;
    context.questions += 1;
    this.execute(context, buildQuestionAnswerText(answer), [...prior]);
  }

  /** Re-runs a failed run's request from scratch. */
  retry(documentId: string, nodeId: string): void {
    const context = this.contexts.get(keyOf(documentId, nodeId));
    if (context) this.start(documentId, nodeId, context.prompt);
  }

  cancel(documentId: string, nodeId: string): void {
    const key = keyOf(documentId, nodeId);
    const context = this.contexts.get(key);
    if (!context) return;
    context.cancelled = true;
    context.session.cancel();
    this.contexts.delete(key);
    this.setState(key, IDLE);
  }

  dispose(): void {
    for (const context of this.contexts.values()) {
      context.cancelled = true;
      context.session.cancel();
    }
    this.contexts.clear();
  }

  /**
   * The popup's OK: writes `spell` + the steps into the main magic node in ONE history group (the host is
   * told it is filling, so `MagicModule` doesn't flag the edit itself), then `meta.handEdited = true` iff the
   * popup saw a mutation. No-op when nothing changed.
   */
  applyEdit(documentId: string, nodeId: string, edit: IMagicEdit): boolean {
    const scheme = this.deps.getScheme(documentId);
    const magic = scheme?.nodes.getNodeSafe(nodeId);
    if (!scheme || !magic || magic.name !== MAGIC_NAME) return false;
    const currentSpell = this.readSpell(documentId, nodeId) ?? '';
    if (!edit.handEdited && edit.spell === currentSpell) return true;
    const apply = (): void => {
      if (edit.spell !== currentSpell) {
        scheme.commands.dispatchCommand(CMD_SET_DATA, { data: { spell: edit.spell }, id: nodeId });
      }
      if (edit.handEdited) {
        for (const id of magic.children.map((child) => child.id)) {
          scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id });
        }
        for (const [index, node] of edit.children.entries()) {
          scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index, node, parentId: nodeId });
        }
        scheme.commands.dispatchCommand(CMD_SET_META, { id: nodeId, meta: { ...magic.meta, handEdited: true } });
      }
    };
    this.setFilling(nodeId, true);
    try {
      this.runGrouped(scheme, apply);
    } finally {
      this.setFilling(nodeId, false);
    }
    return true;
  }

  setFilling = (nodeId: string, filling: boolean): void => {
    if (filling) this.filling.add(nodeId);
    else this.filling.delete(nodeId);
  };

  // --- internals ------------------------------------------------------------------------------

  private onSpellCommitted(documentId: string, nodeId: string, prev: string, next: string): void {
    const node = this.deps.getScheme(documentId)?.nodes.getNodeSafe(nodeId);
    if (!node) return;
    if (node.children.length === 0) {
      this.startGenerate(documentId, nodeId);
      return;
    }
    const regenerate = prev === next;
    this.requestConfirm({
      accept: () =>
        regenerate ? this.startGenerate(documentId, nodeId) : this.startUpdate(documentId, nodeId, prev, next),
      kind: regenerate ? 'regenerate' : 'update',
    });
  }

  private start(documentId: string, nodeId: string, prompt: IMagicPrompt): void {
    const key = keyOf(documentId, nodeId);
    this.cancel(documentId, nodeId);
    const scheme = this.deps.getScheme(documentId);
    if (!scheme) return;
    const context: IRunContext = {
      cancelled: false,
      documentId,
      filled: false,
      noted: false,
      nodeId,
      prompt,
      questions: 0,
      session: this.createSession(scheme, documentId, nodeId, (info) => {
        const current = this.contexts.get(key);
        if (!current) return;
        current.filled = true;
        current.noted = current.noted || info.noted;
      }),
    };
    this.contexts.set(key, context);
    this.execute(context, prompt.request, []);
  }

  private createSession(
    scheme: Scheme,
    documentId: string,
    nodeId: string,
    onFilled: (info: { noted: boolean }) => void,
  ): AgentSession {
    const resolver: IAgentDocumentResolver = {
      resolve: (id) => {
        if (id !== documentId) throw new Error(`A magic run can only read document ${documentId}`);
        const current = this.deps.getScheme(documentId);
        if (!current) throw new Error(`Document ${documentId} not found`);
        return current;
      },
    };
    return new AgentSession(scheme, this.deps.createLlmClient(), this.deps.createContextProviders(), {
      coreTools: ['get_tree', 'get_node_kinds', 'finish'],
      documentResolver: resolver,
      nodeKindFilter: this.deps.nodeKindFilter,
      toolProviders: [
        ...this.deps.createToolProviders(),
        new MagicToolProvider({
          getScheme: () => this.deps.getScheme(documentId),
          nodeId,
          nodeKindFilter: this.deps.nodeKindFilter,
          onFilled,
          setFilling: this.setFilling,
        }),
      ],
    });
  }

  private async execute(context: IRunContext, request: string, priorMessages: TLlmMessage[]): Promise<void> {
    const key = keyOf(context.documentId, context.nodeId);
    this.setState(key, { error: null, question: null, status: 'generating' });
    const { session } = context;
    await session.run(request, {
      activeDocumentId: context.documentId,
      allowQuestions: this.deps.getAllowQuestions(),
      consecutiveQuestions: context.questions,
      focusNodeId: context.nodeId,
      maxSteps: MAGIC_MAX_STEPS,
      priorMessages,
      systemPrompt: context.prompt.systemPrompt,
    });
    if (context.cancelled || this.contexts.get(key) !== context) return;
    if (session.status === 'awaiting-answer' && session.question) {
      this.setState(key, { error: null, question: session.question, status: 'asking' });
    } else if (session.status === 'error') {
      this.setState(key, { error: session.error || 'The agent failed', question: null, status: 'failed' });
    } else if (context.filled) {
      if (!context.noted) this.applyNote(context, session.message);
      this.setState(key, IDLE);
    } else {
      this.setState(key, {
        error: session.message || 'The agent finished without filling the node',
        question: null,
        status: 'failed',
      });
    }
  }

  /** `meta.note` from the agent's `finish` line — only when `fill_magic_node` carried no `note` of its own
   *  (that one lands in the fill's undo step). This fallback is its own undo step: the fill's group is
   *  already closed when `finish` arrives, and there is no group to join. */
  private applyNote(context: IRunContext, message: string): void {
    const scheme = this.deps.getScheme(context.documentId);
    const magic = scheme?.nodes.getNodeSafe(context.nodeId);
    const note = message.trim();
    if (!scheme || !magic || !note) return;
    this.runGrouped(scheme, () =>
      scheme.commands.dispatchCommand(CMD_SET_META, { id: magic.id, meta: { ...magic.meta, note } }),
    );
  }

  private setState(key: string, state: IMagicRunState): void {
    runInAction(() => {
      if (state === IDLE) this.states.delete(key);
      else this.states.set(key, state);
    });
  }

  private readSpell(documentId: string, nodeId: string): string | null {
    const node = this.deps.getScheme(documentId)?.nodes.getNodeSafe(nodeId);
    if (!node || node.name !== MAGIC_NAME) return null;
    return (node.data as { spell?: string } | null)?.spell ?? '';
  }

  private runGrouped(scheme: Scheme, fn: () => void): void {
    if (scheme.container.isRegistered(TOKEN_HISTORY, true))
      resolveService(TOKEN_HISTORY, scheme.container).runGrouped(fn);
    else fn();
  }
}
