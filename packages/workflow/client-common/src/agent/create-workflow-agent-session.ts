import {
  AgentSession,
  JSON_FILES_SYSTEM_PROMPT,
  JsonFileToolProvider,
  JsonFilesContextProvider,
  ProjectDocumentsContextProvider,
  type IAgentContextProvider,
  type IAgentDocumentResolver,
  type IAgentNodeKindFilter,
  type IAgentToolProvider,
  type ILlmClient,
} from '@falang/agent';
import type { NodesStack } from '@falang/dto';
import { ScopeVariablesContextProvider } from '@falang/typescript-agent';
import { getIntegrationInstances } from '../integration-instances.js';
import { getEnabledIntegrations } from '../disabled-vendors.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { createAgentDocumentResolver } from './create-agent-document-resolver.js';
import { DocumentToolProvider } from './document-tool-provider.js';
import { createWorkflowNodeKindFilter } from './integration-catalog.js';
import { describeSections, folderPath } from './project-layout-context.js';
import { IntegrationToolProvider } from './integration-tool-provider.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';
import { CodeIntegrationTools } from './code/code-integration-tools.js';
import { CODE_SYSTEM_PROMPT } from './code/code-prompt.js';
import { CodeFilesContextProvider, CodeToolProvider, describeInstanceForCode } from './code/code-tool-provider.js';
import { WorkflowJsonFilesHost, type TWorkflowCheckProject } from './workflow-json-files-host.js';

/** How the agent edits documents: the node tools (the product default) or whole JSON files (ADR 0062). */
export type TWorkflowAgentInterface = 'nodes' | 'code' | 'json';

export interface ICreateWorkflowAgentSessionDeps {
  /** The vendor connection — the real host's is `HttpLlmClient` (the backend's `/agent/chat` proxy); a headless host passes its own. */
  readonly llmClient: ILlmClient;
  readonly store: IWorkflowAgentStore;
  /** Called once per document per run, on first touch — the host's document lock (`AgentLockTracker.acquire`). */
  readonly acquireLock?: (documentId: string) => void;
  /** Fires before every resolved core tool call — the host's "ensure the document has a tab" cue (ADR 0036 (private)). */
  readonly onOpenDocument?: (documentId: string) => void;
  /** Fires once a run settles, after every undo group is closed — release locks, track the turn. Gets the session so it can read `status`. */
  readonly onRunFinished?: (session: AgentSession) => void;
  /** Pause after focusing the icon about to change; `0` skips it (headless). Defaults to `AgentSession`'s own 300ms. */
  readonly focusPauseMs?: number;
  /** `'nodes'` (default — what ships) or `'json'`: document files + `check_project` instead of the node tools. */
  readonly agentInterface?: TWorkflowAgentInterface;
  /** `check_project` for the `'json'` interface (compile + type-check); omitted → the tool isn't offered. */
  readonly checkProject?: TWorkflowCheckProject;
  /** Builds the stack of a document type with no document yet (for `NODES.md` in an empty project). */
  readonly buildStack?: (type: string) => NodesStack | null;
}

/** The `'code'` interface (ADR 0061 spike): no node tools, file tools over the code projection instead. */
const createWorkflowCodeAgentSession = (deps: ICreateWorkflowAgentSessionDeps): AgentSession => {
  const { store } = deps;
  const integrations = getEnabledIntegrations();
  const session: AgentSession = new AgentSession(
    null,
    deps.llmClient,
    [new CodeFilesContextProvider({ integrations, store })],
    {
      coreTools: [],
      focusPauseMs: deps.focusPauseMs,
      onRunFinished: () => deps.onRunFinished?.(session),
      systemPrompt: CODE_SYSTEM_PROMPT,
      toolProviders: [
        new CodeToolProvider({
          acquireLock: deps.acquireLock,
          checkProject: deps.checkProject,
          integrations,
          onOpenDocument: deps.onOpenDocument,
          store,
        }),
        new CodeIntegrationTools(new IntegrationToolProvider(store), (instanceId) =>
          describeInstanceForCode(store, integrations, instanceId),
        ),
      ],
    },
  );
  return session;
};

const documentsContext = (store: IWorkflowAgentStore): IAgentContextProvider =>
  new ProjectDocumentsContextProvider(
    () =>
      store.documents
        .filter((doc) => !doc.pinned)
        .map((doc) => ({
          id: doc.id,
          name: doc.name,
          path: folderPath(doc.folderId, store.folders ?? []) ?? '',
          type: doc.type,
        })),
    () => describeSections(store.folders ?? []),
  );

/**
 * The `'json'` interface (ADR 0062): no node tools (`coreTools: []` — only `finish`/`ask_user` remain), the file tools
 * over `WorkflowJsonFilesHost`, plus document creation/types (`DocumentToolProvider`) and integrations. A write goes
 * through the same resolver as a node tool (lock + "ensure the tab is open"), then one undo group.
 */
const createJsonFilesSession = (
  deps: ICreateWorkflowAgentSessionDeps,
  shared: { documentResolver: IAgentDocumentResolver; focusPauseMs?: number; nodeKindFilter: IAgentNodeKindFilter },
  integrationTools: IAgentToolProvider,
  getSession: () => AgentSession,
): AgentSession => {
  const host = new WorkflowJsonFilesHost({
    beforeWrite: (documentId) => {
      shared.documentResolver.resolve(documentId);
      deps.onOpenDocument?.(documentId);
    },
    buildStack: deps.buildStack,
    checkProject: deps.checkProject,
    nodeKindFilter: shared.nodeKindFilter,
    store: deps.store,
  });
  return new AgentSession(null, deps.llmClient, [new JsonFilesContextProvider(host)], {
    ...shared,
    coreTools: [],
    onRunFinished: () => deps.onRunFinished?.(getSession()),
    systemPrompt: JSON_FILES_SYSTEM_PROMPT,
    // No create_document: a new `functions/`/`types/` file creates the document (two ways to create confused the model).
    toolProviders: [
      new JsonFileToolProvider(host),
      new DocumentToolProvider(deps.store, ['create_trigger_document', 'list_types']),
      integrationTools,
    ],
  });
};

/**
 * The workflow product's one project-level `AgentSession` (ADR 0036 (private)), exactly as `WorkflowStore` builds it
 * for the editor: no default scheme (every run names its `activeDocumentId`), the scope-variables and project-documents
 * context providers, the cross-document resolver, `DocumentToolProvider` + `IntegrationToolProvider`, and the
 * node-kind filter over the registered integrations. Pure of browser APIs — a headless host (the agent tuner, ADR 0051
 * (private)) calls this same factory instead of re-assembling a session by hand, so it measures what ships.
 *
 * In plain Node import it by its deep path (`@falang/workflow-client-common/src/agent/create-workflow-agent-session.js`);
 * the package root pulls in browser-only modules.
 */
export const createWorkflowAgentSession = (deps: ICreateWorkflowAgentSessionDeps): AgentSession => {
  const { store } = deps;
  if (deps.agentInterface === 'code') return createWorkflowCodeAgentSession(deps);
  const documentResolver = createAgentDocumentResolver({
    acquireLock: (documentId) => deps.acquireLock?.(documentId),
    getDocument: (documentId) => store.getDocument(documentId),
    getScheme: (documentId) => store.getScheme(documentId),
  });
  const nodeKindFilter = createWorkflowNodeKindFilter(REGISTERED_INTEGRATIONS, () =>
    getIntegrationInstances(store.documents),
  );
  const shared = { documentResolver, focusPauseMs: deps.focusPauseMs, nodeKindFilter };
  const integrationTools = new IntegrationToolProvider(store);
  const session: AgentSession =
    deps.agentInterface === 'json'
      ? createJsonFilesSession(deps, shared, integrationTools, () => session)
      : new AgentSession(null, deps.llmClient, [new ScopeVariablesContextProvider(), documentsContext(store)], {
          ...shared,
          onOpenDocument: (target) => deps.onOpenDocument?.(target.id),
          onRunFinished: () => deps.onRunFinished?.(session),
          toolProviders: [new DocumentToolProvider(store), integrationTools],
        });
  return session;
};
