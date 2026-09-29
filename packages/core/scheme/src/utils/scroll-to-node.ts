import type { Scheme } from '../scheme/scheme.js';

/**
 * Pans the view so `nodeId`'s icon is centered in the viewport, without touching the selection —
 * the "just show me" half of `focusNode`, split out for callers that follow something external and
 * must not clobber whatever the user has selected (the debugger following a paused node, ADR 0021
 * §3; a live execution's current node, ADR 0022; the cross-document agent, ADR 0034). Same viewport
 * math as `focusNode`: `scheme.getDomRect()` is the root scheme div, which
 * `TransformContainerComponent`'s translate/scale is relative to. Returns `false` if the node has no
 * icon yet (not laid out, or not in this scheme) — or if this scheme's own root div isn't mounted at
 * all, which happens for any open document that isn't the currently *active* tab (`ProjectWorkspace`
 * only mounts one `SchemeView` at a time): a background document's `Scheme` still exists and can
 * still be mutated, it just has nothing to pan. Without this check, `getDomRect()`'s own
 * "element not found" throw would abort the whole caller (a real crash hit live by ADR 0034's
 * cross-document agent switching tabs mid-run, then coming back to mutate the document it started
 * on).
 */
export const scrollToNode = (scheme: Scheme, nodeId: string): boolean => {
  const icon = scheme.icons.getIconSafe(nodeId);
  if (!icon) return false;
  if (globalThis.document && !globalThis.document.querySelector(`#${scheme.rootDivId}`)) return false;

  const rect = scheme.getDomRect();
  const nodeCenterX = icon.x + (icon.right - icon.left) / 2;
  const nodeCenterY = icon.y + icon.height / 2;
  scheme.viewPosition.setPosition(rect.width / 2 - nodeCenterX, rect.height / 2 - nodeCenterY);
  scheme.viewPosition.setScale(1);
  return true;
};
