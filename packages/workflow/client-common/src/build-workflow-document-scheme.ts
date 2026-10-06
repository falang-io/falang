import {
  CopyPasteModule,
  createNodeStoreFromNode,
  HistoryModule,
  type ICopyPasteOrigin,
  setRootNodeForScheme,
  type IModule,
  type ITheme,
  type Scheme,
} from '@falang/scheme';
import { objectsStructureSchemeFactory } from '@falang/typescript-scheme';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { workflowFunctionalSchemeFactory, type IWorkflowFunctionalSchemeFactoryParams } from '@falang/workflow-scheme';
import type { DependencyContainer } from '@falang/di';
import { isAgentEditableType } from './agent/create-agent-document-resolver.js';
import { REGISTERED_INTEGRATIONS } from './integrations-registry.js';
import { ROOT_NODE, type DocumentType, type WorkflowDocument } from './workflow-types.js';

export interface IBuildWorkflowDocumentSchemeParams {
  /** The (non-pinned) document to open — `data` is its stored root, absent for a never-edited one (the node kind's factory default is used). */
  readonly doc: Pick<WorkflowDocument, 'id' | 'name' | 'type' | 'data'>;
  /** The project's container (`WorkflowStore.container`) — carries the TypeScript project service the schemes share. */
  readonly parentContainer: DependencyContainer;
  /** Live read access to the project's integration instances (the `integrations` document). */
  readonly getCredentialInstances: () => readonly IIntegrationInstance[];
  /** Host-only modules (`ExecutionPositionModule`, `DebuggerModule`, …) — added before the history module. */
  readonly extraModules?: readonly IModule[];
  readonly theme?: ITheme;
  /** HTTP-backed pickers for the editor's forms. Optional: without them the scheme still builds and the agent's tools work
   *  (they read the integration catalog directly), only the field-options/ActivePieces pickers show nothing. */
  readonly getFieldOptionsProvider?: IWorkflowFunctionalSchemeFactoryParams['getFieldOptionsProvider'];
  readonly getActivepiecesCatalogProvider?: IWorkflowFunctionalSchemeFactoryParams['getActivepiecesCatalogProvider'];
  readonly getActivepiecesFieldOptionsProvider?: IWorkflowFunctionalSchemeFactoryParams['getActivepiecesFieldOptionsProvider'];
  /** What a plain valence-point click inserts (`'magic'` when the host enables magic insert, else `'action'`). */
  readonly defaultInsertNodeName?: () => string;
  /** Runs after the scheme exists and the theme is set, before its root node is set — the host's place to register the magic host. */
  readonly onSchemeCreated?: (scheme: Scheme) => void;
}

/** The project type a workflow scheme copies icons from / pastes them into (`CopyPasteModule`). */
export const WORKFLOW_PROJECT_TYPE = 'workflow';

const FUNCTION_LIKE_TYPES: ReadonlySet<string> = new Set(['function', TRIGGER_FUNCTION_NAME]);

/**
 * Copy/paste between workflow documents: the same document type, or `function` ↔ `trigger-function` — both share one
 * node stack and their bodies take the same statements (the module still checks every pasted kind against the target).
 */
export const canPasteBetweenWorkflowDocuments = (source: ICopyPasteOrigin, target: ICopyPasteOrigin): boolean =>
  source.projectType === target.projectType &&
  (source.documentType === target.documentType ||
    (FUNCTION_LIKE_TYPES.has(source.documentType) && FUNCTION_LIKE_TYPES.has(target.documentType)));

/**
 * The workflow product's per-document `Scheme`, exactly as `WorkflowStore.buildScheme` builds it: the workflow function
 * factory for `function`/`trigger-function` documents (every registered integration's node kinds), the objects-structure
 * factory otherwise, `HistoryModule` for every agent-editable type (one agent request = one undo group per document),
 * `CopyPasteModule` (icon copy/paste via the context menus, `canPasteBetweenWorkflowDocuments`), and
 * the document's stored root or its node kind's factory default. The host keeps what is host-specific — the
 * `EVENT_ONCHANGE` autosave subscription, the magic-host registration (`onSchemeCreated`), debug/run modules (`extraModules`).
 *
 * A headless host (the agent tuner, ADR 0051 (private)) calls this same function instead of re-assembling schemes. Deep
 * import in plain Node: `@falang/workflow-client-common/src/build-workflow-document-scheme.js`.
 */
export const buildWorkflowDocumentScheme = (params: IBuildWorkflowDocumentSchemeParams): Scheme => {
  const { doc } = params;
  const extraModules: IModule[] = [...(params.extraModules ?? [])];
  const isFunctionDoc = doc.type === 'function' || doc.type === TRIGGER_FUNCTION_NAME;
  // The project's one `AgentSession` (ADR 0036 (private) §1/§3) needs `HistoryModule` in every document it can run against
  // (one agent request = one undo group per document touched) — registered per agent-editable scheme (`objects-structure`
  // too, since 2026-09-27), unlike `AgentModule` itself, which hosts no longer use.
  if (isAgentEditableType(doc.type)) extraModules.push(new HistoryModule());
  extraModules.push(
    new CopyPasteModule({
      projectType: WORKFLOW_PROJECT_TYPE,
      documentType: doc.type,
      canPasteFrom: canPasteBetweenWorkflowDocuments,
    }),
  );
  const scheme = isFunctionDoc
    ? workflowFunctionalSchemeFactory({
        id: doc.id,
        name: doc.name,
        parentContainer: params.parentContainer,
        extraModules,
        integrations: REGISTERED_INTEGRATIONS,
        getCredentialInstances: params.getCredentialInstances,
        getFieldOptionsProvider: params.getFieldOptionsProvider,
        getActivepiecesCatalogProvider: params.getActivepiecesCatalogProvider,
        getActivepiecesFieldOptionsProvider: params.getActivepiecesFieldOptionsProvider,
        defaultInsertNodeName: params.defaultInsertNodeName,
      })
    : objectsStructureSchemeFactory({
        id: doc.id,
        name: doc.name,
        extraModules,
        parentContainer: params.parentContainer,
      });
  if (params.theme) scheme.theme.setTheme(params.theme);
  params.onSchemeCreated?.(scheme);
  // Safe to narrow: callers reject pinned (non-schemable) documents before this runs.
  const rootNode = doc.data ?? scheme.infra.structure.factory(ROOT_NODE[doc.type as DocumentType]);
  setRootNodeForScheme(scheme, createNodeStoreFromNode(rootNode, scheme));
  return scheme;
};
