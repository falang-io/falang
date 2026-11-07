import type { Scheme } from '@falang/scheme';
import type { TypesRegistryStore } from '@falang/typescript-scheme';
import type { ITableDocumentData, TTriggerFunctionBodyData } from '@falang/workflow-dto';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import type { IApiVendorData } from '../api-types.js';
import type { IProjectTreeFolder } from '@falang/dto';
import type { DocumentType, WorkflowDocument } from '../workflow-types.js';

/**
 * The slice of `WorkflowStore` the project's editing agent actually touches — what `DocumentToolProvider`,
 * `IntegrationToolProvider` and the agent-session/magic-run factories read and write. `WorkflowStore` implements it
 * structurally; a headless host (the agent tuner, ADR 0051 (private)) supplies its own in-memory implementation instead
 * of dragging in the real store (network, IndexedDB, MobX-heavy UI state).
 *
 * Type-only imports throughout, so this file costs nothing at runtime and stays safe to load in plain Node.
 */
export interface IWorkflowAgentStore {
  /** Every project document (pinned ones included — the `integrations` document is where instances live). */
  readonly documents: readonly WorkflowDocument[];
  /** Every project folder (`fixedKind` marks the root section folders, ADR 0055 (private)). */
  readonly folders: readonly IProjectTreeFolder[];
  getDocument(documentId: string): WorkflowDocument | undefined;
  /** The document's live `Scheme`, built on demand; throws for an unknown or pinned document. */
  getScheme(documentId: string): Scheme;
  /** Creates a blank `function`/`objects-structure` document, returns its id. */
  createDocument(type: DocumentType, name: string, folderId?: string | null): string;
  /** The validated field list of a `table` document (ADR 0075 (private)); empty when missing or malformed. */
  getTableData(documentId: string): ITableDocumentData;
  /** Replaces a `table` document's field list (already normalised by the caller). */
  updateTableFields(documentId: string, data: ITableDocumentData): void;
  /** Creates a trigger-bound `trigger-function` document, returns its id. */
  createTriggerFunctionDocument(name: string, bodyData: TTriggerFunctionBodyData, folderId?: string | null): string;
  /** Creates or replaces an integration instance in the `integrations` document. */
  saveIntegrationInstance(instance: IIntegrationInstance): void;
  /** Vendors with a configured platform test bot on this deployment (ADR 0073 (private)); empty when none. */
  getSandboxVendors(): readonly string[];
  /** The project's struct-type registry (`list_types` reads the project's own interfaces from it). */
  readonly typesRegistry: Pick<TypesRegistryStore, 'types'>;
  /** Backend-synced per-instance data (`list_types` derives vendor instance types from it). */
  readonly vendorData: { readonly byInstance: ReadonlyMap<string, IApiVendorData> };
}
