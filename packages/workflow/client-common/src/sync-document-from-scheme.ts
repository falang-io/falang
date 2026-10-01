import type { INode } from '@falang/dto';
import { EVENT_ONCHANGE, getNodeStoreDto, type Scheme } from '@falang/scheme';
import { updateTypesRegistryFromINode, type TypesRegistryStore } from '@falang/typescript-scheme';
import type { WorkflowDocument } from './workflow-types.js';

/**
 * Brings the project's document list and struct-type registry up to date with one scheme's live tree: `doc.data` becomes
 * the serialized root (`getNodeStoreDto`, the same payload the editor saves and compiles) and the root's interfaces are
 * re-registered, so an agent's later `get_tree`/`list_types` sees what an earlier tool call just changed. This is the
 * agent-relevant half of what the editor does on every change — the HTTP save/debounce/version bits stay in
 * `WorkflowStore`. Returns the new root, or `null` when the scheme has none yet.
 *
 * Pure of browser APIs (Node-safe), so a headless host calls it instead of hand-writing the sync.
 */
export const syncWorkflowDocumentFromScheme = (
  doc: Pick<WorkflowDocument, 'data'>,
  scheme: Scheme,
  typesRegistry: TypesRegistryStore,
): INode | null => {
  const rootNode = scheme.rootNode;
  if (!rootNode) return null;
  const node = getNodeStoreDto(rootNode, scheme);
  doc.data = node;
  updateTypesRegistryFromINode(node, typesRegistry);
  return node;
};

/**
 * Runs `syncWorkflowDocumentFromScheme` on every `EVENT_ONCHANGE` of `scheme`; `onSynced` gets the new root after each
 * sync (the editor schedules its autosave there). Call it right after the scheme is built, as `WorkflowStore.buildScheme`
 * does. The subscription lives as long as the scheme.
 */
export const subscribeWorkflowDocumentSync = (
  doc: Pick<WorkflowDocument, 'data'>,
  scheme: Scheme,
  typesRegistry: TypesRegistryStore,
  onSynced?: (root: INode) => void,
): void => {
  scheme.events.subscribeEvent(EVENT_ONCHANGE, () => {
    const root = syncWorkflowDocumentFromScheme(doc, scheme, typesRegistry);
    if (root) onSynced?.(root);
    return false;
  });
};
