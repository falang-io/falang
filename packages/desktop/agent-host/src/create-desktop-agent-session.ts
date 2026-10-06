import {
  AgentSession,
  ProjectDocumentsContextProvider,
  type IAgentDocumentResolver,
  type IAgentNodeKindFilter,
  type IAgentToolProvider,
  type ILlmClient,
} from '@falang/agent';
import type { Scheme } from '@falang/scheme';
import { ScopeVariablesContextProvider } from '@falang/typescript-agent';
import {
  explainNotAgentCapable,
  isAgentCapableDocumentType,
  type TDesktopAgentProduct,
} from './agent-capable-documents.js';

export interface IDesktopAgentDocument {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

/**
 * The slice of a desktop project store (`DesktopProjectStore`, `ArduinoProjectStore`) the project's editing agent touches.
 * Both stores implement it structurally; a headless host (the agent tuner, ADR 0051 (private)) supplies its own in-memory
 * implementation instead of the real, IPC-backed store.
 */
export interface IDesktopAgentStore {
  /** Every project document (non-agent-capable ones included — the context provider lists only the capable ones). */
  readonly documents: readonly IDesktopAgentDocument[];
  getDocument(documentId: string): IDesktopAgentDocument | undefined;
  /** The document's live `Scheme`, built on demand; throws for a document without a scheme editor. */
  getScheme(documentId: string): Scheme;
}

/**
 * Resolves a tool call's `documentId` to a `Scheme` for the project's `AgentSession` — throws a clear error for an unknown
 * or non-agent-capable document (`AgentSession` turns the throw into a `fail()` tool result, not a fatal run error).
 */
export const createDesktopAgentDocumentResolver = (
  product: TDesktopAgentProduct,
  store: Pick<IDesktopAgentStore, 'getDocument' | 'getScheme'>,
): IAgentDocumentResolver => ({
  resolve: (documentId) => {
    const doc = store.getDocument(documentId);
    if (!doc) throw new Error(`Document "${documentId}" was not found in this project`);
    if (!isAgentCapableDocumentType(product, doc.type)) throw new Error(explainNotAgentCapable(product, doc));
    return store.getScheme(documentId);
  },
});

export interface ICreateDesktopAgentSessionDeps {
  readonly product: TDesktopAgentProduct;
  /** The vendor connection — the real host's is `ElectronLlmClient` (IPC to `main`'s `callOpenAiChat`); a headless host passes its own. */
  readonly llmClient: ILlmClient;
  readonly store: IDesktopAgentStore;
  /** Fires before every resolved core tool call — the host's "ensure the document has a tab" cue (ADR 0036 (private)). */
  readonly onOpenDocument?: (documentId: string) => void;
  /** Pause after focusing the icon about to change; `0` skips it (headless). Defaults to `AgentSession`'s own 300ms. */
  readonly focusPauseMs?: number;
  /** Defaults to `createDesktopAgentDocumentResolver(product, store)`; a host that exposes its resolver (for tests) passes it here. */
  readonly documentResolver?: IAgentDocumentResolver;
  /** Host-defined extra tools (ADR 0054 (private) §6: the Arduino `DriverToolProvider`). */
  readonly toolProviders?: readonly IAgentToolProvider[];
  /** Trims what `get_node_kinds` lists (never what validates) — the Arduino host hides actions of drivers with no device in `Devices`. */
  readonly nodeKindFilter?: IAgentNodeKindFilter;
}

/**
 * The desktop IDEs' one project-level `AgentSession` (ADR 0036 (private)), exactly as `DesktopProjectStore`/
 * `ArduinoProjectStore` build it for the editor: no default scheme (every run names its `activeDocumentId`), the
 * scope-variables and project-documents (agent-capable ones only) context providers, and the cross-document resolver. Pure
 * of browser/Electron APIs — a headless host (ADR 0051 (private)) calls this same factory instead of re-assembling a
 * session by hand, so it measures what ships.
 */
export const createDesktopAgentSession = (deps: ICreateDesktopAgentSessionDeps): AgentSession => {
  const { product, store } = deps;
  return new AgentSession(
    null,
    deps.llmClient,
    [
      new ScopeVariablesContextProvider(),
      new ProjectDocumentsContextProvider(() =>
        store.documents
          .filter((doc) => isAgentCapableDocumentType(product, doc.type))
          .map((doc) => ({ id: doc.id, name: doc.name, type: doc.type })),
      ),
    ],
    {
      documentResolver: deps.documentResolver ?? createDesktopAgentDocumentResolver(product, store),
      focusPauseMs: deps.focusPauseMs,
      toolProviders: deps.toolProviders,
      nodeKindFilter: deps.nodeKindFilter,
      // Fires before every core (node) tool call, for whichever document it targets — "ensure open", not "steal the
      // active tab" (ADR 0036 (private), "Opening a document the agent touches" amendment); the host implements that.
      onOpenDocument: (scheme) => deps.onOpenDocument?.(scheme.id),
    },
  );
};
