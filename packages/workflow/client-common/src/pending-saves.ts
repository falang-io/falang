interface IPendingSave {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly save: () => Promise<unknown>;
}

/**
 * One debounced save per document id, with the save itself kept alongside its timer so it can be
 * run early (`flushAll`) — `ProjectSync` needs that before a build, otherwise a "Run" click within
 * the debounce window of the last edit would compile the documents as the backend last stored them,
 * not as the editor shows them. Pure bookkeeping, no I/O of its own.
 */
export class PendingSaves {
  private readonly byId = new Map<string, IPendingSave>();
  private readonly debounceMs: number;
  private readonly onError: (error: unknown) => void;

  constructor(debounceMs: number, onError: (error: unknown) => void) {
    this.debounceMs = debounceMs;
    this.onError = onError;
  }

  /** (Re)schedules `save` for `id`, replacing any pending one. */
  schedule(id: string, save: () => Promise<unknown>): void {
    this.cancel(id);
    const timer = setTimeout(() => {
      this.byId.delete(id);
      save().catch(this.onError);
    }, this.debounceMs);
    this.byId.set(id, { timer, save });
  }

  cancel(id: string): void {
    const existing = this.byId.get(id);
    if (!existing) return;
    clearTimeout(existing.timer);
    this.byId.delete(id);
  }

  /** Runs every pending save right now and waits for all of them; failures go to `onError` like a timer-driven save's would. */
  async flushAll(): Promise<void> {
    const pending = [...this.byId.values()];
    for (const entry of pending) clearTimeout(entry.timer);
    this.byId.clear();
    await Promise.all(pending.map((entry) => entry.save().catch(this.onError)));
  }
}
