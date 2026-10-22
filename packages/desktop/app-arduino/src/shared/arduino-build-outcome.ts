import type { IArduinoCliResult } from '@falang/desktop-arduino-cli';
import type { IArduinoCliDiagnostic, IArduinoCompileProblem, IArduinoSketchFile } from './arduino-sketch-code.js';

/**
 * `compileArduinoProject` (see `@falang/desktop-arduino-compiler`) can fail before `arduino-cli` is ever
 * invoked — a missing `setup`/`loop` or a node that fails to compile — which is a different kind of
 * failure from `arduino-cli` itself failing (a real syntax/toolchain error). Kept as a discriminated
 * union rather than folding both into one `{ ok, output }` shape so the renderer can show each with
 * different framing (an editor-level problem vs. a real compile/upload error) without string-sniffing.
 *
 * Both stages carry what the build panel needs to point at nodes: `problems` (per-document compile failures — absent
 * when the build was refused before compiling, e.g. a broken driver) and, after `arduino-cli`, the gcc `diagnostics`
 * attributed to documents/nodes through the sketch's markers. `files` is the code that was (or would have been) sent to
 * the board, for the code viewer.
 */
export type TArduinoBuildOutcome =
  | {
      readonly stage: 'compile-error';
      readonly message: string;
      readonly problems?: readonly IArduinoCompileProblem[];
      readonly files?: readonly IArduinoSketchFile[];
    }
  | {
      readonly stage: 'cli';
      readonly result: IArduinoCliResult;
      readonly files: readonly IArduinoSketchFile[];
      readonly diagnostics: readonly IArduinoCliDiagnostic[];
    };
