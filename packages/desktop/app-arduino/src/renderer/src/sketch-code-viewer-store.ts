import { action, makeObservable, observable, runInAction } from 'mobx';
import type {
  IArduinoCliDiagnostic,
  IArduinoCompileProblem,
  IArduinoSketchFile,
  TArduinoGeneratedCode,
} from '../../shared/arduino-sketch-code.js';

export interface ISketchCodeFocus {
  readonly path: string;
  /** 1-based. */
  readonly line: number;
}

/** What the build panel hands over after a build: the code it sent to `arduino-cli` and what came back. */
export interface ISketchBuildResultForView {
  readonly files: readonly IArduinoSketchFile[];
  readonly problems?: readonly IArduinoCompileProblem[];
  readonly diagnostics?: readonly IArduinoCliDiagnostic[];
  readonly focus?: ISketchCodeFocus | null;
}

/**
 * The "View code" modal's state (`SketchCodeViewerModal`). `openFresh` (Sketch → View Code…) compiles the current
 * documents through `arduino:generate-code` without building anything; `showBuildResult` (the build panel) shows exactly
 * the files of the last build together with its compile problems and gcc diagnostics.
 */
export class SketchCodeViewerStore {
  @observable isOpen = false;
  @observable loading = false;
  @observable loadError: string | null = null;
  @observable.ref files: readonly IArduinoSketchFile[] = [];
  @observable.ref problems: readonly IArduinoCompileProblem[] = [];
  @observable.ref diagnostics: readonly IArduinoCliDiagnostic[] = [];
  @observable.ref focus: ISketchCodeFocus | null = null;
  /** Ignores a slow `generate` that a newer open (or a close) has superseded. */
  private requestSeq = 0;

  private readonly generate: () => Promise<TArduinoGeneratedCode>;

  constructor(generate: () => Promise<TArduinoGeneratedCode>) {
    this.generate = generate;
    makeObservable(this);
  }

  @action async openFresh(): Promise<void> {
    this.requestSeq += 1;
    const seq = this.requestSeq;
    this.isOpen = true;
    this.loading = true;
    this.loadError = null;
    this.files = [];
    this.problems = [];
    this.diagnostics = [];
    this.focus = null;
    try {
      const result = await this.generate();
      if (seq !== this.requestSeq) return;
      runInAction(() => {
        this.files = result.files;
        if (!result.ok) {
          this.problems = result.problems;
          if (result.problems.length === 0) this.loadError = result.message;
        }
      });
    } catch (error) {
      if (seq !== this.requestSeq) return;
      runInAction(() => {
        this.loadError = error instanceof Error ? error.message : String(error);
      });
    } finally {
      if (seq === this.requestSeq) runInAction(() => (this.loading = false));
    }
  }

  @action showBuildResult(result: ISketchBuildResultForView): void {
    this.requestSeq += 1;
    this.isOpen = true;
    this.loading = false;
    this.loadError = null;
    this.files = result.files;
    this.problems = result.problems ?? [];
    this.diagnostics = result.diagnostics ?? [];
    this.focus = result.focus ?? null;
  }

  @action setFocus(focus: ISketchCodeFocus | null): void {
    this.focus = focus;
  }

  @action close(): void {
    this.requestSeq += 1;
    this.isOpen = false;
    this.loading = false;
  }
}
