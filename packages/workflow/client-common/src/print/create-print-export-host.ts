import type { DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import { getDto, type Scheme, type ITheme } from '@falang/scheme';
import type { IPrintableDocument, IPrintExportHost } from '@falang/antd';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '@falang/typescript-scheme';
import { resolveService } from '@falang/di';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { buildReadOnlyScheme } from '../build-read-only-scheme.js';
import type { WorkflowDocument, WorkflowFolder } from '../workflow-types.js';

export interface IPrintExportHostParams {
  readonly projectId: string;
  readonly projectName: () => string;
  readonly container: DependencyContainer;
  readonly folders: () => readonly WorkflowFolder[];
  readonly documents: () => readonly WorkflowDocument[];
  readonly activeTabId: () => string | null;
  /** The live scheme of a document, or `undefined` when its tab was never opened. */
  readonly getLiveScheme: (documentId: string) => Scheme | undefined;
  readonly getCredentialInstances: () => readonly IIntegrationInstance[];
}

const PRINTABLE_TYPES: ReadonlySet<string> = new Set(['function', 'trigger-function', 'objects-structure']);

/** Documents in project-tree order (folders first, depth-first, then the folder's own documents) — same order `ProjectTree` renders. */
const orderLikeTree = (
  folders: readonly WorkflowFolder[],
  documents: readonly WorkflowDocument[],
  parentId: string | null,
): WorkflowDocument[] => {
  const result: WorkflowDocument[] = [];
  for (const folder of folders) {
    if (folder.parentId === parentId) result.push(...orderLikeTree(folders, documents, folder.id));
  }
  for (const doc of documents) {
    if (doc.folderId === parentId) result.push(doc);
  }
  return result;
};

/** `IPrintExportHost` for the workflow client (ADR 0048 (private)): print = `window.print()` → the browser's "Save as PDF". */
export const createPrintExportHost = (params: IPrintExportHostParams): IPrintExportHost => ({
  get projectName(): string {
    return params.projectName();
  },
  listPrintableDocuments(): IPrintableDocument[] {
    const active = params.activeTabId();
    return orderLikeTree(params.folders(), params.documents(), null)
      .filter((doc) => !doc.pinned && PRINTABLE_TYPES.has(doc.type))
      .map((doc) => ({ id: doc.id, name: doc.name, isActive: doc.id === active }));
  },
  buildPrintScheme(documentId: string, theme: ITheme): Scheme | null {
    const doc = params.documents().find((d) => d.id === documentId);
    if (!doc) return null;
    const live = params.getLiveScheme(documentId);
    const liveRootId = live?.rootNode?.id;
    const root: INode | undefined = live && liveRootId ? getDto(liveRootId, live) : doc.data;
    return buildReadOnlyScheme({
      document: { id: doc.id, name: doc.name, type: doc.type, root },
      theme,
      projectId: params.projectId,
      container: params.container,
      getCredentialInstances: params.getCredentialInstances,
    });
  },
  savePdf(): Promise<void> {
    globalThis.print();
    return Promise.resolve();
  },
  withLightCodeTheme(): () => void {
    const service = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, params.container);
    const previous = service.theme;
    service.setTheme('light');
    return () => service.setTheme(previous);
  },
});
