import type { INode } from '@falang/dto';
import { EVENT_ONCHANGE, getNodeStoreDto, type Scheme } from '@falang/scheme';
import { updateTypesRegistryFromINode, type TypesRegistryStore } from '@falang/typescript-scheme';

/**
 * Brings one desktop document up to date with its scheme's live tree: `doc.root` becomes the serialized root
 * (`getNodeStoreDto`, the same payload the editor saves and compiles) and, when a `typesRegistry` is given, the root's
 * interfaces are re-registered. The editor schedules its debounced autosave after this; the disk I/O stays in the apps.
 * Returns the new root, or `null` when the scheme has none yet. Node-safe, so a headless host calls it instead of
 * hand-writing the sync.
 *
 * `app-arduino` passes its project's `typesRegistry`; `app-sketch` doesn't — its project-wide registries sync is
 * an autorun over `documents` (`syncTypesRegistry`), reacting to this very `doc.root` assignment.
 */
export const syncDesktopDocumentFromScheme = (
  doc: { root?: INode },
  scheme: Scheme,
  typesRegistry?: TypesRegistryStore,
): INode | null => {
  const rootNode = scheme.rootNode;
  if (!rootNode) return null;
  const node = getNodeStoreDto(rootNode, scheme);
  doc.root = node;
  if (typesRegistry) updateTypesRegistryFromINode(node, typesRegistry);
  return node;
};

export interface ISubscribeDesktopDocumentSyncOptions {
  readonly typesRegistry?: TypesRegistryStore;
  /** Gets the new root after each sync (the editor schedules its autosave here). */
  readonly onSynced?: (root: INode) => void;
}

/** Runs `syncDesktopDocumentFromScheme` on every `EVENT_ONCHANGE` of `scheme` — call it right after the scheme is built. */
export const subscribeDesktopDocumentSync = (
  doc: { root?: INode },
  scheme: Scheme,
  options: ISubscribeDesktopDocumentSyncOptions = {},
): void => {
  scheme.events.subscribeEvent(EVENT_ONCHANGE, () => {
    const root = syncDesktopDocumentFromScheme(doc, scheme, options.typesRegistry);
    if (root) options.onSynced?.(root);
    return false;
  });
};
