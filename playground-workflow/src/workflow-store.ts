import 'reflect-metadata';
import { action, makeObservable, observable, reaction } from 'mobx';
import { nanoid } from 'nanoid';
import {
  type Scheme,
  createNodeStoreFromNode,
  setRootNodeForScheme,
  type IModule,
  type ITheme,
  EVENT_ONCHANGE,
  getNodeStoreDto,
} from '@falang/scheme';
import {
  functionalSchemeFactory,
  objectsStructureSchemeFactory,
  registerTypescriptProjectService,
  updateTypesRegistryFromINode,
  updateFunctionsRegistryFromINode,
  TOKEN_TYPESCRIPT_PROJECT_SERVICE,
} from '@falang/typescript-scheme';
import { container, resolveService, type DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';

const darkTheme: ITheme = {
  background: '#1e1e1e',
  gridColor: '#333',
  iconBackground: '#2d2d2d',
  iconBorderColor: '#aaa',
  textColor: '#e0e0e0',
  selectedBorderColor: '#1668dc',
};

export type DocumentType = 'function' | 'objects-structure';

export interface WorkflowFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface WorkflowDocument {
  id: string;
  name: string;
  type: DocumentType;
  parentId: string | null;
  data?: INode;
}

const ROOT_NODE: Record<DocumentType, string> = {
  function: 'function',
  'objects-structure': 'objects-structure',
};

export class WorkflowStore {
  readonly container: DependencyContainer;
  readonly folders = observable<WorkflowFolder>([]);
  readonly documents = observable<WorkflowDocument>([]);
  @observable openTabIds: string[] = [];
  @observable activeTabId: string | null = null;
  @observable selectedNodeId: string | null = null;
  @observable selectedDocId: string | null = null;

  private readonly schemes = new Map<string, Scheme>();

  constructor() {
    this.container = container.createChildContainer();
    registerTypescriptProjectService(this.container);
    makeObservable(this);
    reaction(
      () => this.documents.map((doc) => ({ id: doc.id, name: doc.name, type: doc.type, data: doc.data })),
      (snapshot) => this.syncFunctionsRegistry(snapshot),
      { fireImmediately: true },
    );
  }

  /**
   * Keeps the project-wide function registry (used by `call-function`'s parameter fields) in sync
   * with every `function` document — including ones never opened in a tab, whose signature is
   * still just the empty-parameters default — and drops entries for documents that were deleted
   * or retyped away from `function`.
   */
  private syncFunctionsRegistry(
    snapshot: readonly { id: string; name: string; type: DocumentType; data?: INode }[],
  ): void {
    const functionsRegistry = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, this.container).functionsRegistry;
    const functionDocs = snapshot.filter((doc) => doc.type === 'function');
    const validIds = new Set(functionDocs.map((doc) => doc.id));
    Array.from(functionsRegistry.functions.keys())
      .filter((id) => !validIds.has(id))
      .forEach((id) => functionsRegistry.removeFunction(id));
    functionDocs.forEach((doc) => updateFunctionsRegistryFromINode(doc.id, doc.name, doc.data, functionsRegistry));
  }

  @action createFolder(name: string, parentId: string | null = null): string {
    const id = nanoid();
    this.folders.push({ id, name, parentId });
    return id;
  }

  @action deleteFolder(id: string): void {
    const allIds = new Set([id, ...this.getFolderDescendantIds(id)]);
    const docsToDelete = this.documents.filter((d) => d.parentId !== null && allIds.has(d.parentId));
    for (const doc of docsToDelete) {
      this.closeTab(doc.id);
    }
    this.documents.replace(this.documents.filter((d) => d.parentId === null || !allIds.has(d.parentId)));
    this.folders.replace(this.folders.filter((f) => !allIds.has(f.id)));
  }

  @action createDocument(type: DocumentType, name: string, parentId: string | null = null): string {
    const id = nanoid();
    this.documents.push({ id, name, type, parentId });
    this.openTab(id);
    return id;
  }

  @action deleteDocument(id: string): void {
    this.closeTab(id);
    this.documents.replace(this.documents.filter((d) => d.id !== id));
  }

  @action moveDocument(docId: string, parentId: string | null): void {
    const doc = this.documents.find((d) => d.id === docId);
    if (doc) doc.parentId = parentId;
  }

  @action moveFolder(folderId: string, newParentId: string | null): void {
    if (newParentId !== null) {
      if (folderId === newParentId) return;
      if (this.getFolderDescendantIds(folderId).includes(newParentId)) return;
    }
    const folder = this.folders.find((f) => f.id === folderId);
    if (folder) folder.parentId = newParentId;
  }

  @action openTab(id: string): void {
    if (!this.openTabIds.includes(id)) {
      this.openTabIds = [...this.openTabIds, id];
    }
    this.activeTabId = id;
    this.selectedNodeId = null;
    this.selectedDocId = null;
  }

  @action closeTab(id: string): void {
    this.openTabIds = this.openTabIds.filter((t) => t !== id);
    if (this.activeTabId === id) {
      this.activeTabId = this.openTabIds.at(-1) ?? null;
    }
    if (this.selectedDocId === id) {
      this.selectedNodeId = null;
      this.selectedDocId = null;
    }
    const scheme = this.schemes.get(id);
    if (scheme) {
      scheme.dispose();
      this.schemes.delete(id);
    }
  }

  @action selectNode(docId: string, nodeId: string): void {
    this.selectedDocId = docId;
    this.selectedNodeId = nodeId;
  }

  @action clearSelection(): void {
    this.selectedNodeId = null;
    this.selectedDocId = null;
  }

  getFolderDescendantIds(folderId: string): string[] {
    const direct = this.folders.filter((f) => f.parentId === folderId).map((f) => f.id);
    const result: string[] = [...direct];
    for (const childId of direct) {
      result.push(...this.getFolderDescendantIds(childId));
    }
    return result;
  }

  getDocument(id: string): WorkflowDocument | undefined {
    return this.documents.find((d) => d.id === id);
  }

  getScheme(docId: string): Scheme {
    const existing = this.schemes.get(docId);
    if (existing) return existing;
    const doc = this.getDocument(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);
    const scheme = this.buildScheme(doc);
    this.schemes.set(docId, scheme);
    return scheme;
  }

  private buildScheme(doc: WorkflowDocument, extraModules?: IModule[]): Scheme {
    const scheme =
      doc.type === 'function'
        ? functionalSchemeFactory({
            id: doc.id,
            name: doc.name,
            parentContainer: this.container,
            extraModules,
          })
        : objectsStructureSchemeFactory({
            id: doc.id,
            name: doc.name,
            extraModules,
            parentContainer: this.container,
          });
    scheme.theme.setTheme(darkTheme);
    const rootNode = doc.data ?? scheme.infra.structure.factory(ROOT_NODE[doc.type]);
    const rootStore = createNodeStoreFromNode(rootNode, scheme);
    setRootNodeForScheme(scheme, rootStore);
    scheme.events.subscribeEvent(EVENT_ONCHANGE, () => {
      this.schemeOnChanged(doc, scheme);
      return false;
    });
    return scheme;
  }

  private schemeOnChanged(doc: WorkflowDocument, scheme: Scheme) {
    const rootNode = scheme.rootNode;
    if (!rootNode) return;
    const node = getNodeStoreDto(rootNode);
    doc.data = node;
    updateTypesRegistryFromINode(node, resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, this.container).typesRegistry);
  }
}

export const workflowStore = new WorkflowStore();
