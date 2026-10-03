import { checker } from '../checker.js';
import type { Scheme } from '../scheme/scheme.js';

/**
 * The id of the icon that actually represents `id` on the canvas: the outermost ancestor whose icon
 * hides its descendants (`IconFlags.HidesChildren`, e.g. the workflow product's `magic` block — no icons
 * exist for what's inside it), or `id` itself when nothing above it hides. Lets a live run / a debugger
 * pause / an agent focus that points at a hidden child highlight and pan to the block that is drawn.
 * See ADR 0046 (private).
 */
export const resolveVisibleIconId = (scheme: Scheme, id: string): string => {
  let result = id;
  let current = scheme.nodes.getNodeSafe(id)?.parent ?? null;
  while (current) {
    if (checker.hidesChildren(scheme.icons.getIconSafe(current.id))) result = current.id;
    current = current.parent;
  }
  return result;
};
