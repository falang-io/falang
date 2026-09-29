import type { IArduinoCliResult } from '@falang/desktop-arduino-cli';
import type { IDebugMap } from '@falang/debug';

/**
 * The "Build & Upload (debug)" analogue of `TArduinoBuildOutcome` — the `'cli'` stage also carries the
 * `IDebugMap` the debug build produced (see ADR 0021 (private) §6), since the renderer needs it to
 * resolve `{documentId, nodeId}` breakpoints to the firmware's own dense trace indexes once a
 * `SerialDebugSession` attaches.
 */
export type TArduinoDebugUploadOutcome =
  | { readonly stage: 'compile-error'; readonly message: string }
  | { readonly stage: 'cli'; readonly result: IArduinoCliResult; readonly debugMap: IDebugMap };
