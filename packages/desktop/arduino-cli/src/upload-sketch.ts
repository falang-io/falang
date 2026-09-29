import { runArduinoCli, type IArduinoCliResult } from './run-arduino-cli.js';

export interface IUploadSketchParams {
  readonly sketchDir: string;
  readonly fqbn: string;
  readonly port: string;
}

/**
 * Compiles the sketch **as it currently is on disk** and flashes it — `arduino-cli compile --upload`,
 * one process.
 *
 * Deliberately not a bare `arduino-cli upload`: that subcommand never compiles anything, it only
 * flashes whatever binary the *last* `compile` of that sketch path left in `arduino-cli`'s own build
 * cache (`~/.cache/arduino/sketches/<hash-of-path>/`), and fails with "Compiled sketch not found" if
 * there was never one. This was the real root cause of ADR 0021 (private)'s "the app's own upload
 * step breaks the attach that follows it" gap (2026-09-21): the Arduino app rewrites the sketch
 * files right before calling this, so a bare `upload` silently flashed the previous plain "Build"
 * (no `falang_debug.h`, no `falang_wait_attach()`), and the debugger waited for an `R` that firmware
 * could never send. Confirmed directly against real hardware — a sketch edited to print `Q` still
 * printed `R` after a bare `upload`, and `Q` only after `compile --upload`.
 */
export const uploadSketch = ({ sketchDir, fqbn, port }: IUploadSketchParams): Promise<IArduinoCliResult> =>
  runArduinoCli(['compile', '--upload', '--fqbn', fqbn, '--port', port, sketchDir]);
