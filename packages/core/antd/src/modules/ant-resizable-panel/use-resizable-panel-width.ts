import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export type TResizablePanelDirection = 'left' | 'right';

export interface IUseResizablePanelWidthOptions {
  readonly min?: number;
  readonly max?: number;
  /** Which pointer-move direction grows the panel: `'right'` (default) for a panel pinned to the left
   *  edge of the layout with its resize handle on the panel's own right edge (e.g. the project tree);
   *  `'left'` for a panel pinned to the right edge with its handle on the panel's own left edge (e.g.
   *  the agent/history sidebar). */
  readonly direction?: TResizablePanelDirection;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const readStoredWidth = (storageKey: string, fallback: number): number => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const writeStoredWidth = (storageKey: string, width: number): void => {
  try {
    localStorage.setItem(storageKey, String(Math.round(width)));
  } catch {
    // best-effort only — a private window or blocked site data shouldn't break resizing
  }
};

/**
 * Drag-to-resize width for a fixed-width side panel, persisted to `localStorage` under `storageKey`
 * (read once on mount, written on pointer-up). Returns the current width and a `pointerdown` handler
 * to attach to the panel's resize handle (see `ResizeHandle`).
 */
export const useResizablePanelWidth = (
  storageKey: string,
  defaultWidth: number,
  options: IUseResizablePanelWidthOptions = {},
): [number, (event: React.PointerEvent) => void] => {
  const { min = 150, max = 600, direction = 'right' } = options;
  const sign = direction === 'right' ? 1 : -1;

  const [width, setWidth] = useState(() => clamp(readStoredWidth(storageKey, defaultWidth), min, max));
  // Holds the drag's starting point while a drag is in progress (`null` otherwise) — read/written
  // from the `pointermove`/`pointerup` listeners below rather than closed-over React state, so those
  // listeners don't need to be re-registered on every width change.
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      if (!dragRef.current) return;
      const delta = (event.clientX - dragRef.current.startX) * sign;
      setWidth(clamp(dragRef.current.startWidth + delta, min, max));
    };
    const handlePointerUp = (): void => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setWidth((current) => {
        writeStoredWidth(storageKey, current);
        return current;
      });
    };
    globalThis.addEventListener('pointermove', handlePointerMove);
    globalThis.addEventListener('pointerup', handlePointerUp);
    return () => {
      globalThis.removeEventListener('pointermove', handlePointerMove);
      globalThis.removeEventListener('pointerup', handlePointerUp);
    };
  }, [min, max, sign, storageKey]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startWidth: width };
    },
    [width],
  );

  return [width, onPointerDown];
};
