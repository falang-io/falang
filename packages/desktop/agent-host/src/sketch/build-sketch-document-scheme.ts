import type { DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import {
  createNodeStoreFromNode,
  HistoryModule,
  setRootNodeForScheme,
  type IModule,
  type Scheme,
} from '@falang/scheme';
import { isAgentCapableDocumentType } from '../agent-capable-documents.js';
import { SKETCH_DOCUMENT_TYPES, type SketchDocumentType } from './document-types.js';

export interface IBuildSketchDocumentSchemeParams {
  /** The document to open — `root` is its stored tree, absent for a never-edited one (the node kind's factory default is used). */
  readonly doc: {
    readonly id: string;
    readonly name: string;
    readonly type: SketchDocumentType;
    readonly root?: INode;
  };
  /** The project's container (`createSketchProjectContainer`) — carries the TypeScript project service and the documents registry the schemes share. */
  readonly parentContainer: DependencyContainer;
  /** Host-only modules — added before the history module. */
  readonly extraModules?: readonly IModule[];
}

/**
 * `app-sketch`'s per-document `Scheme`, exactly as `DesktopProjectStore.buildScheme` builds it: the document type's own
 * scheme factory, `HistoryModule` for every agent-capable type (one agent request = one undo group per document touched —
 * the project's one `AgentSession` needs it, ADR 0009/0036 (private)), and the stored root or its node kind's factory
 * default. The host keeps what is host-specific: the `EVENT_ONCHANGE` autosave/sync subscription and tab navigation.
 */
export const buildSketchDocumentScheme = (params: IBuildSketchDocumentSchemeParams): Scheme => {
  const { doc } = params;
  const config = SKETCH_DOCUMENT_TYPES[doc.type];
  const extraModules: IModule[] = [...(params.extraModules ?? [])];
  if (isAgentCapableDocumentType('sketch', doc.type)) extraModules.push(new HistoryModule());
  const scheme = config.buildScheme({
    id: doc.id,
    name: doc.name,
    parentContainer: params.parentContainer,
    extraModules,
  });
  const rootNode = doc.root ?? scheme.infra.structure.factory(config.rootNodeName);
  setRootNodeForScheme(scheme, createNodeStoreFromNode(rootNode, scheme));
  return scheme;
};
