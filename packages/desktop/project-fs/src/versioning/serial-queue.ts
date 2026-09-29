// Only used to let the queue move on once the previous op settles (success or failure); the real
// outcome is `started` itself, returned below.
// oxlint-disable-next-line no-empty-function
const noop = (): void => {};

/**
 * A per-instance FIFO queue: `run(op)` waits for every previously queued operation to settle
 * (success or failure) before starting `op`, and returns `op`'s own outcome to its caller —
 * `GitVersionStore`'s "git operations are serialized per project" contract (ADR "Git specifics
 * (desktop)": "git's index lock is not a concurrency strategy").
 */
export const createSerialQueue = (): (<T>(op: () => Promise<T>) => Promise<T>) => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(op: () => Promise<T>): Promise<T> => {
    const started = tail.then(op, op);
    tail = started.then(noop, noop);
    return started;
  };
};
