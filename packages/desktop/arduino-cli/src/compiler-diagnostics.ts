export type TCompilerDiagnosticSeverity = 'error' | 'warning';

/** One gcc diagnostic line out of `arduino-cli compile`'s output. */
export interface ICompilerDiagnostic {
  /** The file as gcc printed it, or — when it lies inside `sketchDir` — its path relative to it, with `/` separators (`sketch.ino`, `lcd1602-i2c-driver.cpp`). */
  readonly file: string;
  /** 1-based. For the `.ino` this is a line of the file as written: the Arduino preprocessor keeps `#line` directives. */
  readonly line: number;
  readonly column?: number;
  readonly severity: TCompilerDiagnosticSeverity;
  readonly message: string;
}

// `<path>:<line>[:<column>]: (fatal error|error|warning): <message>`. The lazy path match lets a Windows drive letter
// (`C:\…`) through, since `:\` is never followed by digits.
const DIAGNOSTIC_PATTERN = /^(.+?):(\d+)(?::(\d+))?:\s+(fatal error|error|warning):\s+(.*)$/;
// arduino-cli colours its own summary lines; gcc's own lines can be coloured too when a terminal is detected.
// oxlint-disable-next-line no-control-regex -- matching the ANSI escape character is the point
const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

const toSlashes = (filePath: string): string => filePath.replaceAll('\\', '/');

const relativeToSketch = (file: string, sketchDir: string | undefined): string => {
  if (!sketchDir) return file;
  const prefix = `${toSlashes(sketchDir).replace(/\/+$/, '')}/`;
  const normalized = toSlashes(file);
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : file;
};

/**
 * Parses gcc's `file:line:column: error: message` lines out of `arduino-cli compile`'s combined output — what the build
 * panel maps back to documents and nodes. `note:` lines and the "In function …" context lines are skipped; linker errors
 * (`undefined reference`, no line number) don't match and stay visible only in the raw output. Duplicates (gcc repeats
 * a diagnostic once per translation unit that includes a header) are dropped.
 */
export const parseCompilerDiagnostics = (output: string, sketchDir?: string): ICompilerDiagnostic[] => {
  const seen = new Set<string>();
  const diagnostics: ICompilerDiagnostic[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const match = DIAGNOSTIC_PATTERN.exec(rawLine.replaceAll(ANSI_PATTERN, ''));
    if (!match) continue;
    const [, file, line, column, severity, message] = match;
    const diagnostic: ICompilerDiagnostic = {
      file: relativeToSketch(file, sketchDir),
      line: Number(line),
      ...(column ? { column: Number(column) } : {}),
      severity: severity === 'warning' ? 'warning' : 'error',
      message: message.trim(),
    };
    const key = `${diagnostic.file}:${diagnostic.line}:${diagnostic.column ?? ''}:${diagnostic.severity}:${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    diagnostics.push(diagnostic);
  }
  return diagnostics;
};
