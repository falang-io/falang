interface IPendingSave {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly save: () => Promise<unknown>;
}

/** A debounced save that already fired but waits for the document's previous write; the latest call wins. */
interface IQueuedSave {
  save: (() => Promise<unknown>) | null;
}

/**
 * One debounced save per document id, with the save itself kept alongside its timer so it can be
 * run early (`flushAll`) — `ProjectSync` needs that before a build, otherwise a "Run" click within
 * the debounce window of the last edit would compile the documents as the backend last stored them,
 * not as the editor shows them.
 *
 * Writes of one document are also serialised (one promise chain per id): the next write starts only
 * after the previous one settled. Without it two PATCHes of the same document can be in flight at
 * once and the server may apply them in reverse order, leaving the older state on top of the newer
 * one. Debounced saves that fire while a write is in flight collapse into one queued save (the
 * latest wins). No I/O of its own.
 */
export class PendingSaves {
  private readonly byId = new Map<string, IPendingSave>();
  private readonly tails = new Map<string, Promise<void>>();
  private readonly queued = new Map<string, IQueuedSave>();
  private readonly debounceMs: number;
  private readonly onError: (error: unknown) => void;

  constructor(debounceMs: number, onError: (error: unknown) => void) {
    this.debounceMs = debounceMs;
    this.onError = onError;
  }

  /** (Re)schedules `save` for `id`, replacing any pending one. */
  schedule(id: string, save: () => Promise<unknown>): void {
    this.clearTimer(id);
    const timer = setTimeout(() => {
      this.byId.delete(id);
      this.submit(id, save);
    }, this.debounceMs);
    this.byId.set(id, { timer, save });
  }

  /** Drops the debounced save of `id` and any not-yet-started queued one; a write already in flight cannot be recalled. */
  cancel(id: string): void {
    const queued = this.queued.get(id);
    if (queued) queued.save = null;
    this.clearTimer(id);
  }

  private clearTimer(id: string): void {
    const existing = this.byId.get(id);
    if (!existing) return;
    clearTimeout(existing.timer);
    this.byId.delete(id);
  }

  /**
   * Runs `task` after every earlier write of `id` settled and returns its own result (its rejection
   * is passed on; the chain itself never sticks on it).
   */
  exclusive<T>(id: string, task: () => Promise<T>): Promise<T> {
    const result = this.afterTail(id, task);
    this.chain(id, result);
    return result;
  }

  /** Runs every pending save right now and waits for all of them and for writes already in flight; failures go to `onError` like a timer-driven save's would. */
  async flushAll(): Promise<void> {
    const pending = [...this.byId.entries()];
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      this.byId.delete(id);
      this.submit(id, entry.save);
    }
    await Promise.all(this.tails.values());
  }

  /** Queues a debounced save behind the document's previous write, collapsing with a still-waiting one. */
  private submit(id: string, save: () => Promise<unknown>): void {
    const waiting = this.queued.get(id);
    if (waiting && waiting.save) {
      waiting.save = save;
      return;
    }
    const slot: IQueuedSave = { save };
    this.queued.set(id, slot);
    const result = this.afterTail(id, async () => {
      if (this.queued.get(id) === slot) this.queued.delete(id);
      const run = slot.save;
      if (run) await run().catch(this.onError);
    });
    this.chain(id, result);
  }

  /** Starts `task` synchronously when nothing of `id` is in flight (a save leaves right when its timer fires), else after the tail. */
  private afterTail<T>(id: string, task: () => Promise<T>): Promise<T> {
    const tail = this.tails.get(id);
    if (!tail) return task();
    return tail.then(task);
  }

  private chain(id: string, result: Promise<unknown>): void {
    const own: { tail: Promise<void> | null } = { tail: null };
    const release = (): void => {
      if (this.tails.get(id) === own.tail) this.tails.delete(id);
    };
    // Settles (never rejects) once `result` did, so a failed write cannot wedge the chain.
    own.tail = result.then(release, release);
    this.tails.set(id, own.tail);
  }
}
