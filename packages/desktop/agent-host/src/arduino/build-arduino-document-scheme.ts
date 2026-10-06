import type { DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import {
  CopyPasteModule,
  createNodeStoreFromNode,
  HistoryModule,
  type HistoryStore,
  setRootNodeForScheme,
  type IModule,
  type Scheme,
} from '@falang/scheme';
import { arduinoSchemeFactory } from '@falang/desktop-arduino-scheme';

export interface IBuildArduinoDocumentSchemeParams {
  /** A `function` document (`setup`/`loop`/any further function) — `root` is its stored tree, absent for a never-edited one. */
  readonly doc: { readonly id: string; readonly name: string; readonly root?: INode };
  /** The project's container (`createArduinoProjectContainer`). */
  readonly parentContainer: DependencyContainer;
  /** Host-only modules (the editor's `DebuggerModule`, …) — added before the history module. */
  readonly extraModules?: readonly IModule[];
  /** The undo stack of a previous scheme of the same document (same node ids) to continue — see `HistoryModule`. */
  readonly historyStore?: HistoryStore;
}

/**
 * `app-arduino`'s per-document `Scheme`, exactly as `ArduinoProjectStore.buildScheme` builds it: `arduinoSchemeFactory`
 * (the pin / built-in-function / driver-action node kinds on top of the typescript `function` set), `HistoryModule` on every
 * scheme document (one agent request = one undo group per document touched), `CopyPasteModule`, and the stored root or the `function` node
 * kind's default. Every Arduino document that has a scheme is a `function` tree; the `Devices` document never reaches here.
 * The host keeps the `EVENT_ONCHANGE` autosave/sync subscription.
 */
/** The project/document type an Arduino scheme copies icons with (`CopyPasteModule`): every scheme document is a `function`. */
export const ARDUINO_COPY_PASTE_ORIGIN = { projectType: 'arduino', documentType: 'function' } as const;

export const buildArduinoDocumentScheme = (params: IBuildArduinoDocumentSchemeParams): Scheme => {
  const { doc } = params;
  const extraModules: IModule[] = [
    ...(params.extraModules ?? []),
    new HistoryModule({ store: params.historyStore }),
    new CopyPasteModule(ARDUINO_COPY_PASTE_ORIGIN),
  ];
  const scheme = arduinoSchemeFactory({
    id: doc.id,
    name: doc.name,
    parentContainer: params.parentContainer,
    extraModules,
  });
  const rootNode = doc.root ?? scheme.infra.structure.factory('function');
  setRootNodeForScheme(scheme, createNodeStoreFromNode(rootNode, scheme));
  return scheme;
};
