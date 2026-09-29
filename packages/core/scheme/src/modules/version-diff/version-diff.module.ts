import { resolveService } from '@falang/di';
import type { INodeTreeDiff } from '@falang/versioning';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import type { CssClassesStore } from '../../store/css-classes.store.js';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';

export type TVersionDiffSide = 'left' | 'right';

export interface IVersionDiffModuleParams {
  readonly diff: INodeTreeDiff;
  readonly side: TVersionDiffSide;
}

/** Block classes `VersionDiffModule` toggles — style them from a host theme if the defaults below don't fit. */
export const DIFF_ADDED_CLASS = 'diff-added';
export const DIFF_REMOVED_CLASS = 'diff-removed';
export const DIFF_MODIFIED_CLASS = 'diff-modified';
export const DIFF_MOVED_CLASS = 'diff-moved';

// green
const DIFF_ADDED_COLOR = '#2da44e';
// red
const DIFF_REMOVED_COLOR = '#cf222e';
// amber
const DIFF_MODIFIED_COLOR = '#bf8700';
// blue
const DIFF_MOVED_COLOR = '#0969da';

const blockRule = (className: string, color: string) => `
  div.block-body.${className} {
    border-color: ${color};
    border-width: 2px;
    box-shadow: 0 0 0 3px ${color}59;
  }
  svg .block-body.${className} {
    stroke: ${color};
    stroke-width: 3;
  }
`;

const versionDiffCss = [
  blockRule(DIFF_ADDED_CLASS, DIFF_ADDED_COLOR),
  blockRule(DIFF_REMOVED_CLASS, DIFF_REMOVED_COLOR),
  blockRule(DIFF_MODIFIED_CLASS, DIFF_MODIFIED_COLOR),
  blockRule(DIFF_MOVED_CLASS, DIFF_MOVED_COLOR),
].join('\n');

/**
 * Ordered, deduplicated list of node ids `side` should let the user step through — the summary-list
 * half of a diff (top of a removed/added subtree, plus every modified/moved node), in `diff.changes`'
 * own order. The panel drives "next/previous change" with this plus the existing `scrollToNode`
 * (ADR 0022/0021). `removed` only exists on `left` (the `a` snapshot), `added` only on `right` (`b`);
 * `modified`/`moved` share the same id on both sides, so they're always included regardless of side.
 */
export const changeIdsForSide = (diff: INodeTreeDiff, side: TVersionDiffSide): string[] => {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const change of diff.changes) {
    const belongsToSide =
      (change.kind === 'removed' && side === 'left' && change.topLevel) ||
      (change.kind === 'added' && side === 'right' && change.topLevel) ||
      change.kind === 'modified' ||
      change.kind === 'moved';
    if (!belongsToSide || seen.has(change.id)) continue;
    seen.add(change.id);
    ids.push(change.id);
  }
  return ids;
};

/**
 * Marks a static `INodeTreeDiff` on one side of the split diff view (ADR 0025) with `diff-added`/
 * `diff-removed`/`diff-modified`/`diff-moved` block classes via `CssClassesStore` — same shape as
 * `ExecutionPositionModule` (ADR 0022), but the diff never changes across the module's lifetime (a
 * new comparison builds a fresh pair of read-only schemes, not a live-updating one), so the classes
 * are applied once in `initialize()` rather than through a MobX reaction. `left` marks
 * `removedIds`+`modifiedIds`+`movedIds`; `right` marks `addedIds`+`modifiedIds`+`movedIds` — a node
 * both modified and moved on a side ends up with both classes. Ids not present in this scheme (e.g.
 * the other side's added/removed ids) are silently ignored: `CssClassesStore.addBlockClass` doesn't
 * validate against `scheme.nodes`, it just keys a class list by id.
 */
export class VersionDiffModule implements IModule {
  private readonly diff: INodeTreeDiff;
  private readonly side: TVersionDiffSide;
  private cssClasses: CssClassesStore | null = null;

  constructor(params: IVersionDiffModuleParams) {
    this.diff = params.diff;
    this.side = params.side;
  }

  initialize(scheme: Scheme): void {
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    this.cssClasses = cssClasses;
    cssClasses.addRootExtraCss(() => versionDiffCss);

    const primaryIds = this.side === 'left' ? this.diff.removedIds : this.diff.addedIds;
    const primaryClass = this.side === 'left' ? DIFF_REMOVED_CLASS : DIFF_ADDED_CLASS;

    for (const id of primaryIds) cssClasses.addBlockClass(id, primaryClass);
    for (const id of this.diff.modifiedIds) cssClasses.addBlockClass(id, DIFF_MODIFIED_CLASS);
    for (const id of this.diff.movedIds) cssClasses.addBlockClass(id, DIFF_MOVED_CLASS);
  }

  dispose(): void {
    if (!this.cssClasses) return;
    this.cssClasses.removeClassFromAllBlocks(DIFF_ADDED_CLASS);
    this.cssClasses.removeClassFromAllBlocks(DIFF_REMOVED_CLASS);
    this.cssClasses.removeClassFromAllBlocks(DIFF_MODIFIED_CLASS);
    this.cssClasses.removeClassFromAllBlocks(DIFF_MOVED_CLASS);
    this.cssClasses = null;
  }
}
