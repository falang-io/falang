import type { IconStore } from '../../store/icon.store.js';

/** The subset of a React mouse-down event the drag needs — tests pass a plain object instead of a DOM event. */
export interface IIconMouseDownEvent {
  button: number;
  target: unknown;
  preventDefault(): void;
}

/** One ghost shape rendered by `IconsDragLayer`: an icon's shape at its real position translated by the cursor delta. */
export interface IGhostShape {
  icon: IconStore;
  x: number;
  y: number;
}

/** Mouse-down happened on an icon but the cursor hasn't travelled `DRAG_START_THRESHOLD` yet. */
export interface IPendingDrag {
  iconId: string;
  startX: number;
  startY: number;
  /** The mode (`start`/`transfer`) to restore once the drag ends. */
  returnMode: string;
}

export interface IActiveDrag {
  startX: number;
  startY: number;
  returnMode: string;
}
