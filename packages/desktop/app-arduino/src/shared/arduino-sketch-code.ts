// Plain structural copies of `@falang/desktop-arduino-compiler`'s `IArduinoProjectCompileErrorEntry` and
// `ILocatedCompilerDiagnostic` — this file is read by the renderer, which never imports that package (it is Node-only).

/** One file of the sketch as it goes to the board: `sketch.ino` first, then the used drivers' sources (paths relative to the sketch folder). */
export interface IArduinoSketchFile {
  readonly path: string;
  readonly content: string;
}

/** A failure of falang's own compile (`compileArduinoProject`, before `arduino-cli` runs), attributed to a document and, when known, a node. */
export interface IArduinoCompileProblem {
  readonly documentId: string;
  readonly documentName: string;
  readonly nodeId?: string;
  readonly message: string;
}

/** A gcc diagnostic from `arduino-cli`, attributed to a document/node when it points at a line of `sketch.ino`. */
export interface IArduinoCliDiagnostic {
  /** Relative to the sketch folder when it lies inside it (`sketch.ino`, a driver's `.cpp`), else as gcc printed it. */
  readonly file: string;
  /** 1-based. */
  readonly line: number;
  readonly column?: number;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly documentId?: string;
  readonly documentName?: string;
  readonly nodeId?: string;
}

/**
 * "View code" (`arduino:generate-code`): the sketch compiled without writing it anywhere. On a failed compile `files` holds
 * whatever did compile (the failing documents are missing from `sketch.ino`).
 */
export type TArduinoGeneratedCode =
  | { readonly ok: true; readonly files: readonly IArduinoSketchFile[] }
  | {
      readonly ok: false;
      readonly message: string;
      readonly problems: readonly IArduinoCompileProblem[];
      readonly files: readonly IArduinoSketchFile[];
    };
