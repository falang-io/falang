import { action, makeObservable, observable } from 'mobx';
import { generateUuid } from './generate-uuid.js';
import { reportError } from '../../shared/report-error.js';

export type TExportKind = 'logic' | 'code';

export interface IExportProgressUpdate {
  readonly done: number;
  readonly total: number;
  readonly label: string;
}

/**
 * Tracks one in-flight export run — logic-constructor codegen (`exportLogicCode`) or `code`-document
 * codegen (`exportCodeDocuments`), both of which now run in a disposable worker process instead of
 * blocking this window's own event loop (see ADR 0019 (private)'s "Implementation notes (export
 * worker …)"). One instance per `DesktopProjectStore`. Only one export can be in flight at a time —
 * the UI disables the export actions while `active` is true rather than queuing a second run.
 */
export class ExportProgressStore {
  @observable active = false;
  @observable label = '';
  @observable done = 0;
  @observable total = 0;
  @observable cancelRequested = false;

  private requestId: string | null = null;
  private kind: TExportKind | null = null;

  constructor() {
    makeObservable(this);
  }

  @action
  start(kind: TExportKind): string {
    const requestId = generateUuid();
    this.requestId = requestId;
    this.kind = kind;
    this.active = true;
    this.cancelRequested = false;
    this.label = '';
    this.done = 0;
    this.total = 0;
    return requestId;
  }

  /** Ignores a progress event for any request id other than the current one — a stale event from a
   * just-cancelled run racing this run's own start, or arriving after `finish()` already ran. */
  @action
  reportProgress(requestId: string, progress: IExportProgressUpdate): void {
    if (requestId !== this.requestId) return;
    this.done = progress.done;
    this.total = progress.total;
    this.label = progress.label;
  }

  @action
  finish(): void {
    this.active = false;
    this.requestId = null;
    this.kind = null;
  }

  /** Kills the worker process running the current export — `ipcRenderer.invoke` has no built-in
   * cancellation, same reasoning `agent-chat-handler.ts` documents for `agentChat`/`agentChatCancel`. */
  @action
  cancel(): void {
    if (!this.requestId || !this.kind) return;
    this.cancelRequested = true;
    const api = this.kind === 'logic' ? globalThis.falang.logicExport : globalThis.falang.codeExport;
    api.cancel(this.requestId).catch((error: unknown) => reportError('Failed to cancel export', error));
  }
}
