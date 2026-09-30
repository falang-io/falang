import type { DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import { getDto, type ITheme, type Scheme } from '@falang/scheme';
import type { IPrintableDocument, IPrintExportHost } from '@falang/antd';
import { buildReadOnlyScheme } from '../versioning/build-read-only-scheme.js';

interface IPrintFolder {
  readonly id: string;
  readonly parentId: string | null;
}

interface IPrintDocument {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly folderId: string | null;
  readonly root?: INode;
}

export interface IPrintExportHostParams {
  readonly projectDir: string;
  readonly container: DependencyContainer;
  readonly folders: () => readonly IPrintFolder[];
  readonly documents: () => readonly IPrintDocument[];
  readonly activeTabId: () => string | null;
  /** The live scheme of a document, or `undefined` when its tab was never opened. */
  readonly getLiveScheme: (documentId: string) => Scheme | undefined;
  /** Whether a document of this type has a scheme to print. */
  readonly isPrintable: (document: IPrintDocument) => boolean;
  /** Orders one level's documents the way `ProjectTree` shows them (defaults to insertion order). */
  readonly orderLevel?: (documents: readonly IPrintDocument[], parentId: string | null) => readonly IPrintDocument[];
}

/** Documents in project-tree order (folders first, depth-first, then the folder's own documents) — same order `ProjectTree` renders. */
const orderLikeTree = (params: IPrintExportHostParams, parentId: string | null): IPrintDocument[] => {
  const result: IPrintDocument[] = [];
  for (const folder of params.folders()) {
    if (folder.parentId === parentId) result.push(...orderLikeTree(params, folder.id));
  }
  const here = params.documents().filter((doc) => doc.folderId === parentId);
  result.push(...(params.orderLevel ? params.orderLevel(here, parentId) : here));
  return result;
};

const projectNameOf = (projectDir: string): string => projectDir.split(/[\\/]/).findLast((part) => part !== '') ?? '';

/** `IPrintExportHost` for a desktop app (ADR 0048 (private)): `printToPDF` + save dialog in `main`. */
export const createPrintExportHost = (params: IPrintExportHostParams): IPrintExportHost => ({
  projectName: projectNameOf(params.projectDir),
  listPrintableDocuments(): IPrintableDocument[] {
    const active = params.activeTabId();
    return orderLikeTree(params, null)
      .filter((doc) => params.isPrintable(doc))
      .map((doc) => ({ id: doc.id, name: doc.name, isActive: doc.id === active }));
  },
  buildPrintScheme(documentId: string, _theme: ITheme): Scheme | null {
    const doc = params.documents().find((d) => d.id === documentId);
    if (!doc) return null;
    const live = params.getLiveScheme(documentId);
    const root: INode | undefined = live?.rootNode ? getDto(live.rootNode.id, live) : doc.root;
    return buildReadOnlyScheme({
      document: { id: doc.id, name: doc.name, type: doc.type, root },
      container: params.container,
    });
  },
  async savePdf(suggestedFileName: string): Promise<void> {
    // Resolves on a cancelled save dialog too (nothing to report); rejects on a real write/print failure.
    await globalThis.falang.print.toPdf({ suggestedFileName });
  },
});
