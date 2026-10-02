import { action, makeObservable, observable } from 'mobx';
import { initializeDriverRegistry, type TDriverScopeHint } from '@falang/desktop-arduino-scheme';
import type { IDriverListEntry, IDriverListPayload } from '../../shared/driver-ipc-types.js';

/**
 * A fingerprint of what scheme node kinds are built from: every driver's id and config, nothing else (not the
 * scope, status, errors or `differsFromLibrary` flags). Two payloads with the same fingerprint need no scheme
 * rebuild — in particular adoption (a library driver copied into the project, byte-identical) only changes the
 * scope, so it never triggers one (ADR 0054 (private) §5).
 */
export const driversFingerprint = (entries: readonly IDriverListEntry[]): string =>
  JSON.stringify(
    entries
      .map((entry) => [entry.config.id, entry.config] as const)
      .toSorted((a, b) => a[0].localeCompare(b[0]))
      .map(([, config]) => config),
  );

const scopesOf = (entries: readonly IDriverListEntry[]): Record<string, TDriverScopeHint> =>
  Object.fromEntries(entries.map((entry) => [entry.config.id, entry.scope]));

/**
 * The renderer's copy of the main process's driver list (`falang.drivers.list()` / `drivers:changed`), plus the
 * side effect of keeping `@falang/desktop-arduino-scheme`'s module-level registry in sync with it. One module-level
 * singleton: the registry itself is module-level too, and the Drivers dialog works without an open project.
 */
export class DriversRegistryStore {
  @observable.ref payload: IDriverListPayload | null = null;
  private fingerprint: string | null = null;
  private readonly configListeners = new Set<() => void>();
  private stopListening: (() => void) | null = null;

  constructor() {
    makeObservable(this);
  }

  scopeOf(driverId: string): TDriverScopeHint | undefined {
    return this.payload?.drivers.find((entry) => entry.config.id === driverId)?.scope;
  }

  get entries(): readonly IDriverListEntry[] {
    return this.payload?.drivers ?? [];
  }

  /**
   * Takes a fresh payload: always re-initializes the scheme registry (cheap; keeps palette labels/scope hints
   * current for schemes built from now on) and reports whether the set of driver *configs* changed since the
   * previous payload — the only thing that requires rebuilding already-open schemes. The first payload ever
   * seen counts as a change.
   */
  @action apply(payload: IDriverListPayload): boolean {
    this.payload = payload;
    const next = driversFingerprint(payload.drivers);
    const changed = next !== this.fingerprint;
    this.fingerprint = next;
    initializeDriverRegistry(
      payload.drivers.map((entry) => entry.config),
      scopesOf(payload.drivers),
    );
    return changed;
  }

  /**
   * Subscribes to `drivers:changed` (once; main.tsx calls this at startup). Every event goes through
   * `apply`, and only an event that changed the configs notifies `onConfigsChanged` listeners — so exactly one
   * place decides "did the set change", however many project stores are alive.
   */
  start(): void {
    if (this.stopListening) return;
    this.stopListening = globalThis.falang.drivers.onChanged((payload) => this.handleChangedEvent(payload));
  }

  /** The `drivers:changed` handler (public for tests). */
  handleChangedEvent(payload: IDriverListPayload): void {
    if (this.apply(payload)) for (const listener of this.configListeners) listener();
  }

  /** Called after a `drivers:changed` event whose configs differ from the previous list. Returns an unsubscribe. */
  onConfigsChanged(listener: () => void): () => void {
    this.configListeners.add(listener);
    return () => this.configListeners.delete(listener);
  }

  /** `drivers.list()` → `apply` (no listener notification: the caller handles the result itself). Resolves to whether the configs changed. */
  async refresh(): Promise<boolean> {
    return this.apply(await globalThis.falang.drivers.list());
  }
}

export const driversRegistry = new DriversRegistryStore();
