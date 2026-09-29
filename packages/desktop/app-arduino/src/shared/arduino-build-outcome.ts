import type { IArduinoCliResult } from '@falang/desktop-arduino-cli';

/**
 * `compileArduinoProject` (see `main/arduino-compiler/`) can fail before `arduino-cli` is ever
 * invoked — a missing `setup`/`loop` or a node that fails to compile — which is a different kind of
 * failure from `arduino-cli` itself failing (a real syntax/toolchain error). Kept as a discriminated
 * union rather than folding both into one `{ ok, output }` shape so the renderer can show each with
 * different framing (an editor-level problem vs. a real compile/upload error) without string-sniffing.
 */
export type TArduinoBuildOutcome =
  | { readonly stage: 'compile-error'; readonly message: string }
  | { readonly stage: 'cli'; readonly result: IArduinoCliResult };
