import { CELL_SIZE } from '../constants.js';
import type { Scheme } from '../scheme/scheme.js';

export const setSchemeStartPosition = (scheme: Scheme) => {
  const rootIcon = scheme.rootIcon;
  if (!rootIcon) return;
  scheme.viewPosition.setPosition(rootIcon.left + CELL_SIZE, CELL_SIZE);
  scheme.viewPosition.setScale(1);
};
