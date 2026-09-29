import { resolveService } from '@falang/di';
import { BlockEditorStore, TOKEN_SCHEME, type IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable, observable } from 'mobx';
import { TOKEN_PROJECT_DOCUMENTS_REGISTRY } from '../../project-documents-registry/project-documents-registry.token.js';
import type { ProjectDocumentsRegistryStore } from '../../project-documents-registry/project-documents-registry.store.js';

export interface ILinkData {
  documentId: string;
}

export class LinkBlockEditorStore extends BlockEditorStore<ILinkData> {
  @observable data: ILinkData;
  readonly registry: ProjectDocumentsRegistryStore | null;
  readonly currentDocumentId: string | null;

  constructor(params: IBlockEditorFactoryParams<ILinkData>) {
    super(params);
    this.data = params.data;
    try {
      this.registry = resolveService(TOKEN_PROJECT_DOCUMENTS_REGISTRY, params.container);
    } catch {
      this.registry = null;
    }
    try {
      this.currentDocumentId = resolveService(TOKEN_SCHEME, params.container).id;
    } catch {
      this.currentDocumentId = null;
    }
    makeObservable(this);
  }

  getData() {
    return this.data;
  }

  @action setDocumentId(documentId: string) {
    this.data = { ...this.data, documentId };
  }
}
