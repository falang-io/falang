import { createSchemeToken } from '@falang/di';

/** What the host is doing with one magic node right now (ADR 0046 (private)). */
export type TMagicRunStatus = 'idle' | 'generating' | 'asking' | 'failed';

/**
 * The host seam of the magic node: everything that needs an LLM, a popup or the project lives outside
 * this package and is reached through this optional DI token (same shape as `TOKEN_SCHEDULE_STATUS`).
 * Without a host the magic block is a plain text block (no status icon, double-click edits inline).
 */
export interface IMagicHost {
  /** Read inside a MobX observer — keep the answer observable. */
  getStatus(nodeId: string): TMagicRunStatus;
  /** Double-click / "Edit steps…": open the popup editor for this magic node. */
  openEditor(nodeId: string): void;
  /** The user finished editing the `spell` inline (`prev` is `''` for a freshly inserted node), or chose "Regenerate" (`prev === next`). */
  onSpellCommitted(nodeId: string, prev: string, next: string): void;
  /** While `true`, edits inside this magic node don't set `meta.handEdited` (the host is filling it itself). */
  isFilling?(nodeId: string): boolean;
}

export const TOKEN_MAGIC_HOST = createSchemeToken<IMagicHost>('MAGIC_HOST');
