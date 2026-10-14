import { getMonaco, getMonacoLibKey, isMonacoInstalled } from '../monaco/get-monaco.js';

/** The slice of the Monaco API the pool uses — injectable so tests need no real Monaco. */
export interface ICheckModel {
  setValue(value: string): void;
  dispose(): void;
}

export interface ICheckWorkerDiagnostic {
  start?: number;
  length?: number;
  category: number;
  messageText: string | { messageText: string; next?: unknown[] };
}

export interface ICheckMonaco {
  Uri: { parse(value: string): unknown };
  editor: { createModel(value: string, language: string, uri: unknown): ICheckModel };
  typescript: {
    getTypeScriptWorker(): Promise<
      (uri: unknown) => Promise<{
        getSyntacticDiagnostics(fileName: string): Promise<ICheckWorkerDiagnostic[]>;
        getSemanticDiagnostics(fileName: string): Promise<ICheckWorkerDiagnostic[]>;
      }>
    >;
  };
}

export type TDiagnosticRegion = 'prefix' | 'value' | 'suffix';

export interface IFieldDiagnostic {
  message: string;
  /** Offset in the whole checked text. */
  offset: number;
  /** 1-based, relative to the whole text. */
  line: number;
  column: number;
  /** Where the error falls, when the caller passed the field's regions. */
  region?: TDiagnosticRegion;
}

/** Lengths of the field's parts inside the checked text, to tell a hidden-line error from one in the value. */
export interface IFieldRegions {
  prefixLength: number;
  valueLength: number;
}

export interface IMonacoCheckPoolOptions {
  /** Dedicated models = checks in flight. Default 1: the TypeScript worker answers one request at a time anyway. */
  size?: number;
  /** Cached results (by full text and lib variant). Default 500; 0 disables. */
  cacheSize?: number;
  getMonaco?: () => ICheckMonaco;
  /** Identifies the global lib the result was computed against. */
  getLibKey?: () => string;
  isAvailable?: () => boolean;
}

/** TypeScript's `DiagnosticCategory.Error`. */
const ERROR_CATEGORY = 1;

const WORKER_RETRIES = 100;
const WORKER_RETRY_DELAY_MS = 100;

let slotCounter = 0;

interface ISlot {
  model: ICheckModel;
  fileName: string;
  uri: unknown;
  busy: boolean;
}

const flattenMessage = (message: ICheckWorkerDiagnostic['messageText']): string => {
  if (typeof message === 'string') return message;
  const parts = [message.messageText];
  let next = message.next as { messageText: string; next?: unknown[] }[] | undefined;
  while (next && next.length > 0) {
    parts.push(next[0].messageText);
    next = next[0].next as typeof next;
  }
  return parts.join(' ');
};

const positionOf = (text: string, offset: number): { line: number; column: number } => {
  let line = 1;
  let lineStart = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i += 1) {
    if (text.codePointAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
};

export const regionOf = (offset: number, regions: IFieldRegions): TDiagnosticRegion => {
  if (offset < regions.prefixLength) return 'prefix';
  return offset < regions.prefixLength + regions.valueLength ? 'value' : 'suffix';
};

/**
 * A small pool of dedicated Monaco models (`file:///__validation-<n>.ts`, a namespace no editor model uses) for
 * checking field texts in the background (ADR 0068 (private)). A check takes a free slot, rewrites the model's whole
 * content, asks the TypeScript worker for syntactic + semantic diagnostics directly (no marker-adapter debounce) and
 * frees the slot; callers wait for a slot when all are busy. Results are cached by full text and lib variant.
 */
export class MonacoCheckPool {
  private readonly size: number;
  private readonly cacheSize: number;
  private readonly getMonacoFn: () => ICheckMonaco;
  private readonly getLibKey: () => string;
  private readonly isAvailableFn: () => boolean;
  private readonly slots: ISlot[] = [];
  private readonly waiters: ((slot: ISlot) => void)[] = [];
  private readonly cache = new Map<string, Promise<IFieldDiagnostic[]>>();

  constructor(options: IMonacoCheckPoolOptions = {}) {
    this.size = Math.max(1, options.size ?? 1);
    this.cacheSize = Math.max(0, options.cacheSize ?? 500);
    this.getMonacoFn = options.getMonaco ?? (() => getMonaco() as unknown as ICheckMonaco);
    this.getLibKey = options.getLibKey ?? getMonacoLibKey;
    this.isAvailableFn = options.isAvailable ?? isMonacoInstalled;
  }

  /** Whether checks can run at all (Monaco is installed). */
  isAvailable(): boolean {
    return this.isAvailableFn();
  }

  /** Error-category diagnostics of `fullText`, positions relative to the whole text. */
  async check(fullText: string, regions?: IFieldRegions): Promise<IFieldDiagnostic[]> {
    const key = `${this.getLibKey()}\u0000${fullText}`;
    let result = this.cache.get(key);
    if (result) {
      // refresh LRU order
      this.cache.delete(key);
      this.cache.set(key, result);
    } else {
      const promise = this.run(fullText);
      result = promise;
      if (this.cacheSize > 0) {
        this.cache.set(key, promise);
        promise.catch(() => this.cache.delete(key));
        while (this.cache.size > this.cacheSize) {
          const oldest = this.cache.keys().next().value;
          if (typeof oldest !== 'string') break;
          this.cache.delete(oldest);
        }
      }
    }
    const diagnostics = await result;
    if (!regions) return diagnostics;
    // oxlint-disable-next-line no-map-spread -- the cached diagnostics are shared, so they are copied
    return diagnostics.map((diagnostic) => ({ ...diagnostic, region: regionOf(diagnostic.offset, regions) }));
  }

  /** Disposes the pool's models. */
  dispose(): void {
    for (const slot of this.slots) slot.model.dispose();
    this.slots.length = 0;
    this.cache.clear();
  }

  private async run(fullText: string): Promise<IFieldDiagnostic[]> {
    const slot = await this.acquire();
    try {
      const monaco = this.getMonacoFn();
      slot.model.setValue(fullText);
      const getWorker = await this.getWorkerFactory(monaco);
      const worker = await getWorker(slot.uri);
      const [syntactic, semantic] = await Promise.all([
        worker.getSyntacticDiagnostics(slot.fileName),
        worker.getSemanticDiagnostics(slot.fileName),
      ]);
      return (
        [...syntactic, ...semantic]
          .filter((diagnostic) => diagnostic.category === ERROR_CATEGORY)
          // oxlint-disable-next-line no-map-spread -- a fresh object per diagnostic
          .map((diagnostic) => {
            const offset = diagnostic.start ?? 0;
            return { message: flattenMessage(diagnostic.messageText), offset, ...positionOf(fullText, offset) };
          })
      );
    } finally {
      this.release(slot);
    }
  }

  /**
   * Monaco loads its TypeScript contribution lazily, when the first `typescript` model appears (creating a slot's model
   * starts that), and `getTypeScriptWorker()` throws "TypeScript not registered!" until it has loaded — so retry briefly.
   */
  private async getWorkerFactory(monaco: ICheckMonaco) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential retries
        return await monaco.typescript.getTypeScriptWorker();
      } catch (error) {
        // Monaco rejects with a bare string here, not an Error.
        const message = error instanceof Error ? error.message : String(error);
        const notRegistered = /not registered/i.test(message);
        if (!notRegistered || attempt >= WORKER_RETRIES) throw error;
        // oxlint-disable-next-line no-await-in-loop -- a short wait between attempts
        await new Promise((resolve) => {
          setTimeout(resolve, WORKER_RETRY_DELAY_MS);
        });
      }
    }
  }

  private acquire(): Promise<ISlot> {
    const free = this.slots.find((slot) => !slot.busy);
    if (free) {
      free.busy = true;
      return Promise.resolve(free);
    }
    if (this.slots.length < this.size) {
      const monaco = this.getMonacoFn();
      slotCounter += 1;
      const fileName = `file:///__validation-${slotCounter}.ts`;
      const uri = monaco.Uri.parse(fileName);
      const slot: ISlot = { model: monaco.editor.createModel('', 'typescript', uri), fileName, uri, busy: true };
      this.slots.push(slot);
      return Promise.resolve(slot);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private release(slot: ISlot): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(slot);
      return;
    }
    slot.busy = false;
  }
}
