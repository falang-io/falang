import { AgentSession, ProjectDocumentsContextProvider, type ILlmClient } from '@falang/agent';
import { ScopeVariablesContextProvider } from '@falang/typescript-agent';
import { getIntegrationInstances } from '../integration-instances.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { createAgentDocumentResolver } from './create-agent-document-resolver.js';
import { DocumentToolProvider } from './document-tool-provider.js';
import { createWorkflowNodeKindFilter } from './integration-catalog.js';
import { describeSections, folderPath } from './project-layout-context.js';
import { IntegrationToolProvider } from './integration-tool-provider.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

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
}

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
  const session: AgentSession = new AgentSession(
    null,
    deps.llmClient,
    [
      new ScopeVariablesContextProvider(),
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
      ),
    ],
    {
      documentResolver: createAgentDocumentResolver({
        acquireLock: (documentId) => deps.acquireLock?.(documentId),
        getDocument: (documentId) => store.getDocument(documentId),
        getScheme: (documentId) => store.getScheme(documentId),
      }),
      focusPauseMs: deps.focusPauseMs,
      nodeKindFilter: createWorkflowNodeKindFilter(REGISTERED_INTEGRATIONS, () =>
        getIntegrationInstances(store.documents),
      ),
      onOpenDocument: (target) => deps.onOpenDocument?.(target.id),
      onRunFinished: () => deps.onRunFinished?.(session),
      toolProviders: [new DocumentToolProvider(store), new IntegrationToolProvider(store)],
    },
  );
  return session;
};
