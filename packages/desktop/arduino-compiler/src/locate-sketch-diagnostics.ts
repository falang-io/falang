import { parseCompiledMarkers, resolveMarkerLocation, type IMarkerLocation } from '@falang/debug';
import type { ICompilerDiagnostic } from '@falang/desktop-arduino-cli';

/** A gcc diagnostic plus, for a line of the generated `.ino`, the document/node that produced it. */
export interface ILocatedCompilerDiagnostic extends ICompilerDiagnostic, IMarkerLocation {}

/**
 * Attributes every diagnostic against the sketch's own `.ino` (`sketchFileName`, as `parseCompilerDiagnostics` reports it)
 * to the document/node whose `doc-start`/`icon-start` markers enclose that line in `code` — `compileArduinoProject`'s
 * output, written to disk unchanged. Diagnostics in driver files, library headers or lines outside every marker (the
 * preamble, prototypes) come back without a location.
 */
export const locateSketchDiagnostics = (
  diagnostics: readonly ICompilerDiagnostic[],
  sketchFileName: string,
  code: string,
): ILocatedCompilerDiagnostic[] => {
  const markers = parseCompiledMarkers(code);
  return diagnostics.map((diagnostic) =>
    diagnostic.file === sketchFileName
      ? { ...diagnostic, ...resolveMarkerLocation(markers, diagnostic.line - 1) }
      : diagnostic,
  );
};
