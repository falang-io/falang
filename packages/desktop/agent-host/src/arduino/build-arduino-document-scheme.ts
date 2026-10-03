import type { DependencyContainer } from '@falang/di';
import type { INode } from '@falang/dto';
import {
  createNodeStoreFromNode,
  HistoryModule,
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
}

/**
 * `app-arduino`'s per-document `Scheme`, exactly as `ArduinoProjectStore.buildScheme` builds it: `arduinoSchemeFactory`
 * (the pin / built-in-function / driver-action node kinds on top of the typescript `function` set), `HistoryModule` on every
 * scheme document (one agent request = one undo group per document touched), and the stored root or the `function` node
 * kind's default. Every Arduino document that has a scheme is a `function` tree; the `Devices` document never reaches here.
 * The host keeps the `EVENT_ONCHANGE` autosave/sync subscription.
 */
export const buildArduinoDocumentScheme = (params: IBuildArduinoDocumentSchemeParams): Scheme => {
  const { doc } = params;
  const extraModules: IModule[] = [...(params.extraModules ?? []), new HistoryModule()];
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
