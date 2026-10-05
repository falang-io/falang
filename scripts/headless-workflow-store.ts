import 'reflect-metadata';
import { ScriptedLlmClient } from '@falang/agent';
import { container as rootContainer, resolveService, type DependencyContainer } from '@falang/di';
import { registerGlobalTokens, type Scheme } from '@falang/scheme';
import { registerTypescriptProjectService, TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '@falang/typescript-scheme';
import { compileProject, type ICompileProjectParams } from '@falang/workflow-compiler';
import {
  INTEGRATIONS_DOCUMENT_TYPE,
  type IIntegrationInstance,
  type IIntegrationsDocumentData,
} from '@falang/workflow-integrations-common';
import { typeCheckProject } from '../packages/workflow/backend/src/domains/build/build/type-check-project.js';
import { createWorkflowMagicRunStore } from '../packages/workflow/client-common/src/agent/create-workflow-magic-run-store.js';
import type { IApiVendorData } from '../packages/workflow/client-common/src/api-types.js';
import type { IWorkflowAgentStore } from '../packages/workflow/client-common/src/agent/workflow-agent-store.js';
import { buildWorkflowDocumentScheme } from '../packages/workflow/client-common/src/build-workflow-document-scheme.js';
import { getIntegrationInstances } from '../packages/workflow/client-common/src/integration-instances.js';
import { REGISTERED_INTEGRATIONS } from '../packages/workflow/client-common/src/integrations-registry.js';
import {
  subscribeWorkflowDocumentSync,
  syncWorkflowDocumentFromScheme,
} from '../packages/workflow/client-common/src/sync-document-from-scheme.js';
import { buildTriggerFunctionDocument } from '../packages/workflow/client-common/src/trigger-function-document.js';
import type { DocumentType, WorkflowDocument } from '../packages/workflow/client-common/src/workflow-types.js';

/**
 * The in-memory `IWorkflowAgentStore` the headless agent smokes run against: `WorkflowStore` with the network,
 * IndexedDB and tabs taken out — documents live in memory, schemes are the editor's real ones. Shared by
 * `headless-agent-smoke.ts` and `headless-code-agent-smoke.ts`.
 */
export class HeadlessWorkflowStore implements IWorkflowAgentStore {
  readonly documents: WorkflowDocument[] = [];
  readonly vendorData = { byInstance: new Map<string, IApiVendorData>() };
  readonly container: DependencyContainer = rootContainer.createChildContainer();
  readonly magicRuns = createWorkflowMagicRunStore({
    createLlmClient: () => this.magicClient,
    focusPauseMs: 0,
    getAllowQuestions: () => false,
    store: this,
  });
  magicClient: ScriptedLlmClient = new ScriptedLlmClient([]);
  private readonly schemes = new Map<string, Scheme>();
  private nextId = 1;

  constructor() {
    registerGlobalTokens();
    registerTypescriptProjectService(this.container);
    this.documents.push({
      customData: { instances: [] } satisfies IIntegrationsDocumentData,
      folderId: null,
      id: 'integrations',
      name: 'integrations',
      pinned: true,
      type: INTEGRATIONS_DOCUMENT_TYPE,
    });
  }

  get typesRegistry() {
    return resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, this.container).typesRegistry;
  }

  getDocument(documentId: string): WorkflowDocument | undefined {
    return this.documents.find((doc) => doc.id === documentId);
  }

  createDocument(type: DocumentType, name: string, folderId: string | null = null): string {
    this.nextId += 1;
    const id = `doc-${this.nextId}`;
    this.documents.push({ folderId, id, name, type });
    return id;
  }

  createTriggerFunctionDocument(
    name: string,
    bodyData: Parameters<typeof buildTriggerFunctionDocument>[1],
    folderId: string | null = null,
  ): string {
    const doc = buildTriggerFunctionDocument(name, bodyData, folderId);
    this.documents.push(doc);
    return doc.id;
  }

  saveIntegrationInstance(instance: IIntegrationInstance): void {
    const integrations = this.getDocument('integrations');
    const instances = [...getIntegrationInstances(this.documents).filter((item) => item.id !== instance.id), instance];
    if (integrations) integrations.customData = { instances } satisfies IIntegrationsDocumentData;
  }

  getScheme(documentId: string): Scheme {
    const existing = this.schemes.get(documentId);
    if (existing) return existing;
    const doc = this.getDocument(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.pinned) throw new Error(`Document ${documentId} is pinned and has no scheme editor`);
    const isFunctionDoc = doc.type === 'function' || doc.type === 'trigger-function';
    const scheme = buildWorkflowDocumentScheme({
      doc,
      getCredentialInstances: () => getIntegrationInstances(this.documents),
      onSchemeCreated: (created) => {
        if (isFunctionDoc) this.magicRuns.registerHost(doc.id, created);
      },
      parentContainer: this.container,
    });
    // The editor's own sync of `doc.data` and the types registry on every change (its autosave hook is host-only).
    subscribeWorkflowDocumentSync(doc, scheme, this.typesRegistry);
    this.schemes.set(documentId, scheme);
    return scheme;
  }

  /** The tree the editor would save/compile: `doc.data` (kept current by the shared sync), serialized on demand for a never-edited one. */
  rootOf(doc: WorkflowDocument) {
    const scheme = this.schemes.get(doc.id);
    if (scheme) syncWorkflowDocumentFromScheme(doc, scheme, this.typesRegistry);
    return doc.data;
  }

  dispose(): void {
    this.magicRuns.dispose();
    for (const scheme of this.schemes.values()) scheme.dispose();
  }
}

export const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

/** Compiles every function/trigger document with the real workflow compiler and type-checks the result. */
export const compileAndTypeCheck = (store: HeadlessWorkflowStore): { workflows: string; activities: string } => {
  const documents = store.documents
    .filter((doc) => doc.type === 'function' || doc.type === 'trigger-function')
    .map((doc) => ({ id: doc.id, name: doc.name, root: store.rootOf(doc), type: doc.type }));
  const compiled = compileProject({
    documents: documents as unknown as ICompileProjectParams['documents'],
    integrations: REGISTERED_INTEGRATIONS,
    trackPosition: true,
  });
  const errors = typeCheckProject(compiled.workflows, compiled.activities);
  assert(errors.length === 0, `generated code does not type-check:\n${JSON.stringify(errors, null, 2)}`);
  return compiled;
};
