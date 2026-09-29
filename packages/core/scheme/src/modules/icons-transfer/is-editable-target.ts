const EDITABLE_TARGET_SELECTOR = 'input, textarea, [contenteditable]';

/** True when a mouse event's target sits inside an editable element, where `preventDefault()` would break text input. */
export const isEditableTarget = (target: unknown): boolean => {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  return target.closest(EDITABLE_TARGET_SELECTOR) !== null;
};
