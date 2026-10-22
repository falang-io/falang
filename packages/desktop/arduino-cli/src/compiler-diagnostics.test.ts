import { describe, expect, it } from 'vitest';
import { parseCompilerDiagnostics } from './compiler-diagnostics.js';

// Real `arduino-cli compile --fqbn arduino:avr:uno` output (arduino-cli 1.x, avr core 1.8.8), paths shortened.
const OUTPUT = [
  "/home/u/project/src/sketch/drv.cpp: In function 'void drv_do(int)':",
  "/home/u/project/src/sketch/drv.cpp:2:22: error: 'zz' was not declared in this scope",
  ' void drv_do(int a) { zz = a; }',
  '                      ^~',
  "/home/u/project/src/sketch/sketch.ino: In function 'void loop()':",
  "/home/u/project/src/sketch/sketch.ino:18:3: error: 'y' was not declared in this scope",
  '   y = 2;',
  '   ^',
  "/home/u/project/src/sketch/sketch.ino:18:3: error: 'y' was not declared in this scope",
  "/home/u/project/src/sketch/sketch.ino:10:7: warning: unused variable 'x' [-Wunused-variable]",
  '/home/u/project/src/sketch/sketch.ino:9:1: note: declared here',
  '',
  '\u001B[92mUsed platform\u001B[0m \u001B[92mVersion\u001B[0m',
  'Error during build: exit status 1',
].join('\n');

describe('parseCompilerDiagnostics', () => {
  it('parses errors and warnings, relative to the sketch dir, without duplicates or notes', () => {
    expect(parseCompilerDiagnostics(OUTPUT, '/home/u/project/src/sketch')).toEqual([
      { file: 'drv.cpp', line: 2, column: 22, severity: 'error', message: "'zz' was not declared in this scope" },
      { file: 'sketch.ino', line: 18, column: 3, severity: 'error', message: "'y' was not declared in this scope" },
      {
        file: 'sketch.ino',
        line: 10,
        column: 7,
        severity: 'warning',
        message: "unused variable 'x' [-Wunused-variable]",
      },
    ]);
  });

  it('keeps the printed path when no sketch dir is given or the file lies outside it', () => {
    const [diagnostic] = parseCompilerDiagnostics(
      '/opt/arduino/libraries/Foo/Foo.h:3:10: fatal error: Bar.h: No such file or directory',
      '/home/u/project/src/sketch',
    );
    expect(diagnostic).toEqual({
      file: '/opt/arduino/libraries/Foo/Foo.h',
      line: 3,
      column: 10,
      severity: 'error',
      message: 'Bar.h: No such file or directory',
    });
  });

  it('handles Windows paths and CRLF line ends', () => {
    const output = `${String.raw`C:\Users\u\proj\src\sketch\sketch.ino`}:5:1: error: expected ';' before '}' token\r\n`;
    expect(parseCompilerDiagnostics(output, String.raw`C:\Users\u\proj\src\sketch`)).toEqual([
      { file: 'sketch.ino', line: 5, column: 1, severity: 'error', message: "expected ';' before '}' token" },
    ]);
  });

  it('accepts a diagnostic without a column', () => {
    expect(parseCompilerDiagnostics('/p/sketch/sketch.ino:7: error: boom', '/p/sketch')).toEqual([
      { file: 'sketch.ino', line: 7, severity: 'error', message: 'boom' },
    ]);
  });
});
