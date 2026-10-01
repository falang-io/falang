import { resolveService } from '@falang/di';
import { TOKEN_CSS_CLASSES, TOKEN_SELECTION } from '../di-tokens.js';
import type { Scheme } from '../scheme/scheme.js';
import { resolveVisibleIconId } from './resolve-visible-icon-id.js';
import { scrollToNode } from './scroll-to-node.js';

/**
 * Selects a node and pans the view so it's centered in the viewport — for jumping to a node from
 * outside the canvas (e.g. a compile-error list). The pan itself is `scrollToNode`; this adds the
 * selection. Returns `false` if the node has no icon yet (not laid out, or not a node in this scheme).
 *
 * Two separate stores drive the visible highlight, so both are updated: `CssClassesStore`'s
 * `'selected'` block class is what actually paints a block's own border (see `BlockView`/
 * `EditorService.setIconForEdit` — the same mechanism a click-to-edit uses), while `SelectionStore`
 * additionally drives a few container icon types' own line/border rendering (cycle, function, …)
 * that reads `isInSelected` directly instead of going through the shared block-class mechanism.
 */
export const focusNode = (scheme: Scheme, requestedNodeId: string): boolean => {
  const nodeId = resolveVisibleIconId(scheme, requestedNodeId);
  if (!scheme.icons.getIconSafe(nodeId)) return false;

  const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
  cssClasses.removeClassFromAllBlocks('selected');
  cssClasses.addBlockClass(nodeId, 'selected');
  resolveService(TOKEN_SELECTION, scheme.container).select(nodeId);

  return scrollToNode(scheme, nodeId);
};
