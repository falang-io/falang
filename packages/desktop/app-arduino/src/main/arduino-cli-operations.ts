/**
 * Which long `arduino-cli` operation owns the CLI and the board right now (ADR 0074 (private) §5): a
 * Build while an Upload runs, or an update of the managed CLI while a Build runs, is refused rather
 * than queued. Port listing and the driver validator's `arduino-cli` stage are not gated.
 */
import { ArduinoCliBusyError } from './arduino-cli-busy-error.js';
import type { TArduinoCliOperationKind } from './arduino-cli-busy-error.js';

export { ArduinoCliBusyError };
export type { TArduinoCliOperationKind };

export interface IArduinoCliBusyState {
  readonly busy: TArduinoCliOperationKind | null;
}

type TBusyListener = (state: IArduinoCliBusyState) => void;

export class ArduinoCliOperations {
  private current: TArduinoCliOperationKind | null = null;
  private readonly listeners = new Set<TBusyListener>();

  getState(): IArduinoCliBusyState {
    return { busy: this.current };
  }

  /** Subscribes to busy-state changes; returns the unsubscribe function. */
  onChange(listener: TBusyListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Runs `fn` as the only exclusive operation; throws `ArduinoCliBusyError` (without running `fn`) when one is already running. */
  async runExclusive<T>(kind: TArduinoCliOperationKind, fn: () => Promise<T>): Promise<T> {
    if (this.current !== null) throw new ArduinoCliBusyError(this.current, kind);
    this.current = kind;
    this.emit();
    try {
      return await fn();
    } finally {
      this.current = null;
      this.emit();
    }
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // a broken listener must not break the operation
      }
    }
  }
}

/** The one gate of this app's main process. */
export const arduinoCliOperations = new ArduinoCliOperations();
