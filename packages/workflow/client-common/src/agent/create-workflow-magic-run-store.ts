import type { ILlmClient } from '@falang/agent';
import type { Scheme } from '@falang/scheme';
import { ScopeVariablesContextProvider } from '@falang/typescript-agent';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import { getIntegrationInstances } from '../integration-instances.js';
import { REGISTERED_INTEGRATIONS } from '../integrations-registry.js';
import { DocumentToolProvider } from './document-tool-provider.js';
import { createWorkflowNodeKindFilter } from './integration-catalog.js';
import { IntegrationToolProvider } from './integration-tool-provider.js';
import { MagicRunStore } from './magic-run-store.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

/** The main scheme of a function/trigger-function document for a magic run, `null` for anything else (pinned, objects-structure, unknown). */
export const getMagicHostScheme = (
  store: Pick<IWorkflowAgentStore, 'getDocument' | 'getScheme'>,
  documentId: string,
): Scheme | null => {
  const doc = store.getDocument(documentId);
  if (!doc || doc.pinned || !(doc.type === 'function' || doc.type === TRIGGER_FUNCTION_NAME)) return null;
  return store.getScheme(documentId);
};

export interface ICreateWorkflowMagicRunStoreDeps {
  readonly store: IWorkflowAgentStore;
  /** One client per run — the real host's is `HttpLlmClient`. */
  readonly createLlmClient: () => ILlmClient;
  /** The chat's persisted "Don't ask, just do" setting, inverted — read when a run starts. */
  readonly getAllowQuestions: () => boolean;
  /** Pause after focusing the icon about to change; `0` skips it (headless). */
  readonly focusPauseMs?: number;
}

/**
 * The workflow product's `MagicRunStore` (ADR 0046 (private)), wired exactly as `WorkflowStore` wires it: scope-variables
 * context, `IntegrationToolProvider` + a `list_types`-only `DocumentToolProvider` (no document creation), the node-kind
 * filter, and function/trigger-function documents as the only hosts. A headless host calls this instead of assembling
 * magic runs by hand. Deep import in plain Node: `@falang/workflow-client-common/src/agent/create-workflow-magic-run-store.js`.
 */
export const createWorkflowMagicRunStore = (deps: ICreateWorkflowMagicRunStoreDeps): MagicRunStore => {
  const { store } = deps;
  return new MagicRunStore({
    createContextProviders: () => [new ScopeVariablesContextProvider()],
    createLlmClient: deps.createLlmClient,
    createToolProviders: () => [new IntegrationToolProvider(store), new DocumentToolProvider(store, ['list_types'])],
    focusPauseMs: deps.focusPauseMs,
    getAllowQuestions: deps.getAllowQuestions,
    getScheme: (documentId) => getMagicHostScheme(store, documentId),
    nodeKindFilter: createWorkflowNodeKindFilter(REGISTERED_INTEGRATIONS, () =>
      getIntegrationInstances(store.documents),
    ),
  });
};
