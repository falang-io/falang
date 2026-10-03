export type TTabDirection = 'next' | 'previous';

/**
 * The element Tab / Shift+Tab should move to, given the block's fields in DOM order. `null` at either end:
 * the key then does nothing (it must not insert a tab character into a one-line inline field either).
 */
export const pickTabTarget = <T>(fields: readonly T[], current: T, direction: TTabDirection): T | null => {
  const index = fields.indexOf(current);
  if (index === -1) return null;
  return fields[direction === 'next' ? index + 1 : index - 1] ?? null;
};

const FIELD_SELECTOR = 'textarea.inputarea, input:not([type="hidden"]):not([disabled]), select:not([disabled])';

/** Moves DOM focus to the neighbouring field inside the same block (`.block-container`). Returns whether it moved. */
export const focusNeighbourField = (from: HTMLElement, direction: TTabDirection): boolean => {
  const root = from.closest('.block-container');
  if (!root) return false;
  const fields = [...root.querySelectorAll<HTMLElement>(FIELD_SELECTOR)].filter(
    (el) => el.offsetParent !== null || el.classList.contains('inputarea'),
  );
  const ownField = from.querySelector<HTMLElement>('textarea.inputarea');
  if (!ownField) return false;
  const target = pickTabTarget(fields, ownField, direction);
  target?.focus();
  return target !== null;
};
