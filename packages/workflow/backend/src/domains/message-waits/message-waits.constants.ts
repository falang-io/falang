/** The longest wait a node may register — Temporal keeps the run anyway; this bounds the row's lifetime. */
export const MAX_WAIT_TIMEOUT_MS = 30 * 86_400_000;
/** A row outlives its node's own timer a little, so a slow timer never leaves a message unclaimed in between. */
export const WAIT_EXPIRY_GRACE_MS = 60_000;
/** How often expired rows are swept. */
export const WAIT_SWEEP_INTERVAL_MS = 10 * 60_000;
