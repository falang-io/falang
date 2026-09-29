import type { DependencyContainer } from '@falang/di';
import type { INodeTreeDiff, ISnapshotDocument } from '@falang/versioning';
import {
  createNodeStoreFromNode,
  setRootNodeForScheme,
  VersionDiffModule,
  type IModule,
  type Scheme,
  type TVersionDiffSide,
} from '@falang/scheme';
import { arduinoSchemeFactory } from '../arduino-scheme-factory.js';
import { DEVICES_DOCUMENT_TYPE } from '../../../shared/devices-document.js';

export interface IBuildReadOnlySchemeForDiffParams {
  readonly document: ISnapshotDocument;
  readonly diff: INodeTreeDiff;
  readonly side: TVersionDiffSide;
  readonly container: DependencyContainer;
}

/**
 * `ArduinoProjectStore.buildReadOnlySchemeForDiff` — a read-only scheme for one side of the split
 * diff view (ADR 0025 (private)). Every `function` document goes through
 * `arduinoSchemeFactory` — same pin/driver icon groups a live scheme gets (needed to render pin/
 * driver node icons at all), just `readOnly: true` and `VersionDiffModule` instead of
 * `DebuggerModule`/agent modules. The `devices` document (ADR 0032 (private),
 * "Decision → 3") has no `root`/node tree at all, so it returns `null` here — same "no scheme editor
 * for this document type" contract the workflow product's own `buildReadOnlySchemeForDiff` already
 * uses for its `custom` `integrations` document; `VersionDiffView` is already required to cope with a
 * `null` scheme for that reason (see this task's own verification of that). Field-level diffing of
 * `data` itself is out of scope for ADR 0032 (see its "Out of scope" list).
 */
export const buildReadOnlySchemeForDiff = (params: IBuildReadOnlySchemeForDiffParams): Scheme | null => {
  const { document, diff, side, container } = params;
  if (document.type === DEVICES_DOCUMENT_TYPE) return null;

  const extraModules: IModule[] = [new VersionDiffModule({ diff, side })];
  const scheme = arduinoSchemeFactory({
    id: document.id,
    name: document.name,
    parentContainer: container,
    readOnly: true,
    extraModules,
  });
  if (document.root) {
    const rootStore = createNodeStoreFromNode(document.root, scheme);
    setRootNodeForScheme(scheme, rootStore);
  }
  return scheme;
};
