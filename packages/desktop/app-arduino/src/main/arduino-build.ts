import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import type { IDebugMap } from '@falang/debug';
import {
  checkArduinoCli,
  compileSketch,
  listBoards,
  parseCompilerDiagnostics,
  uploadSketch,
  writeSketchFiles,
  type IArduinoCliResult,
  type IArduinoCliStatus,
  type IConnectedBoard,
  type ISketchExtraFile,
} from '@falang/desktop-arduino-cli';
import type { TArduinoBuildOutcome } from '../shared/arduino-build-outcome.js';
import type { TArduinoDebugUploadOutcome } from '../shared/arduino-debug-outcome.js';
import type {
  IArduinoCompileProblem,
  IArduinoSketchFile,
  TArduinoGeneratedCode,
} from '../shared/arduino-sketch-code.js';
import {
  collectDriverExtraFiles,
  FALANG_DEBUG_HEADER_FILENAME,
  locateSketchDiagnostics,
} from '@falang/desktop-arduino-compiler';
import type { ILoadedDriver } from './drivers/driver-registry.js';
import { runCompileJob } from './compile-worker/run-compile-job.js';

/**
 * One Arduino project is one sketch — no need for a per-project configurable name. Generated code lives
 * at `<projectDir>/src/sketch/sketch.ino` (ADR 0032 (private) §4), a visible folder rather than a
 * hidden `.build/` one, so the user can read the generated C++ directly. The extra `sketch/` level is
 * forced by `arduino-cli`'s own rule that a sketch's folder name and its `.ino` basename must match —
 * `src/` itself can't be the sketch folder without renaming the `.ino` to `src.ino`.
 */
const SKETCH_NAME = 'sketch';
const SKETCH_FILE_NAME = `${SKETCH_NAME}.ino`;

const sketchBuildDir = (projectDir: string): string => path.join(projectDir, 'src');

export { checkArduinoCli, listBoards };
export type { IArduinoCliStatus, IConnectedBoard };

type TBuildSketchCodeResult =
  | {
      readonly ok: true;
      readonly code: string;
      readonly usedDriverIds: ReadonlySet<string>;
      readonly debugHeader?: string;
      readonly debugMap?: IDebugMap;
    }
  | {
      readonly ok: false;
      readonly message: string;
      readonly problems?: readonly IArduinoCompileProblem[];
      readonly partialCode?: string;
    };

/**
 * `compileArduinoProject` only makes sense in a real Node process — it pulls in `@falang/logic-constructor`,
 * which uses the real TypeScript Compiler API and `node:path`/`__dirname`, neither available in the
 * renderer's browser-like Vite bundle (confirmed the hard way: an earlier version of this app called it
 * from the renderer and `electron-vite build` failed to bundle it). The renderer only ever sends plain
 * `IProjectDocument[]` over IPC. It no longer runs inline in `main` either, though: it's synchronous
 * CPU-bound work with no `await` inside it, so running it here blocked this whole process's event loop
 * (and therefore every window's IPC) for the entire compile — `runCompileJob` spawns it in a
 * disposable child process instead (`@falang/desktop-worker-process`, see
 * `compile-worker/worker-main.ts`), the same fix ADR 0019 (private) applied to `app-sketch`'s own
 * codegen — see ADR 0020 (private)'s "Implementation notes (compile worker …)".
 */
const buildSketchCode = async (
  documents: readonly IProjectDocument[],
  drivers: readonly ILoadedDriver[],
  debug?: boolean,
): Promise<TBuildSketchCodeResult> => {
  const outcome = await runCompileJob({
    documents: [...documents],
    drivers: drivers.map((driver) => driver.config),
    debug,
  });
  if (!outcome.ok) return outcome;
  return { ...outcome, usedDriverIds: new Set(outcome.usedDriverIds) };
};

/** The sketch as the code viewer shows it: `sketch.ino` first, then every extra file in sketch-folder order (driver sources are read from their driver folders). */
const readSketchFilesForView = async (
  code: string,
  extraFiles: readonly ISketchExtraFile[],
): Promise<IArduinoSketchFile[]> => {
  const extra = await Promise.all(
    extraFiles.map(async (file) => ({
      path: file.relativePath,
      content: 'content' in file ? file.content : await fs.readFile(file.sourcePath, 'utf8'),
    })),
  );
  return [{ path: SKETCH_FILE_NAME, content: code }, ...extra];
};

type TCompileFailure = Extract<TBuildSketchCodeResult, { ok: false }>;

/** A falang-side compile failure as the build panel shows it: the per-document problems plus the code that did compile. */
const compileErrorOutcome = async (failure: TCompileFailure): Promise<TArduinoBuildOutcome> => ({
  stage: 'compile-error',
  message: failure.message,
  ...(failure.problems ? { problems: failure.problems } : {}),
  ...(typeof failure.partialCode === 'string' ? { files: await readSketchFilesForView(failure.partialCode, []) } : {}),
});

/** An `arduino-cli` result plus its gcc diagnostics, each attributed to a document/node when it points at `sketch.ino`. */
const cliOutcome = async (
  result: IArduinoCliResult,
  sketchDir: string,
  code: string,
  extraFiles: readonly ISketchExtraFile[],
): Promise<TArduinoBuildOutcome> => ({
  stage: 'cli',
  result,
  files: await readSketchFilesForView(code, extraFiles),
  diagnostics: locateSketchDiagnostics(parseCompilerDiagnostics(result.output, sketchDir), SKETCH_FILE_NAME, code),
});

/** "View code": compiles the sketch (no debug instrumentation) without writing or building anything. */
export const generateSketchCode = async (
  documents: readonly IProjectDocument[],
  drivers: readonly ILoadedDriver[] = [],
): Promise<TArduinoGeneratedCode> => {
  const built = await buildSketchCode(documents, drivers);
  if (!built.ok) {
    return {
      ok: false,
      message: built.message,
      problems: built.problems ?? [],
      files: typeof built.partialCode === 'string' ? await readSketchFilesForView(built.partialCode, []) : [],
    };
  }
  return {
    ok: true,
    files: await readSketchFilesForView(built.code, collectDriverExtraFiles(drivers, built.usedDriverIds)),
  };
};

export const buildAndCompileSketch = async (
  projectDir: string,
  documents: readonly IProjectDocument[],
  fqbn: string,
  drivers: readonly ILoadedDriver[] = [],
): Promise<TArduinoBuildOutcome> => {
  const built = await buildSketchCode(documents, drivers);
  if (!built.ok) return compileErrorOutcome(built);
  const extraFiles = collectDriverExtraFiles(drivers, built.usedDriverIds);
  const sketchDir = await writeSketchFiles(sketchBuildDir(projectDir), SKETCH_NAME, built.code, extraFiles);
  const result = await compileSketch({ sketchDir, fqbn });
  return cliOutcome(result, sketchDir, built.code, extraFiles);
};

export const buildAndUploadSketch = async (
  projectDir: string,
  documents: readonly IProjectDocument[],
  fqbn: string,
  port: string,
  drivers: readonly ILoadedDriver[] = [],
): Promise<TArduinoBuildOutcome> => {
  const built = await buildSketchCode(documents, drivers);
  if (!built.ok) return compileErrorOutcome(built);
  const extraFiles = collectDriverExtraFiles(drivers, built.usedDriverIds);
  const sketchDir = await writeSketchFiles(sketchBuildDir(projectDir), SKETCH_NAME, built.code, extraFiles);
  const result = await uploadSketch({ sketchDir, fqbn, port });
  return cliOutcome(result, sketchDir, built.code, extraFiles);
};

/**
 * "Build & Upload (debug)" — compiles with trace instrumentation on, writes `falang_debug.h` as an
 * extra sketch file alongside the `.ino` (see `writeSketchFiles`'s `extraFiles`, ADR 0021 (private)
 * §6) plus any driver source files the project actually uses (ADR 0023 (private)'s Phase B/C), and
 * uploads. `debugMap` (resolving `{documentId, nodeId}` ⇄ trace index for a real session) is only
 * meaningful when the upload itself succeeded — `SerialDebugSession` doesn't get constructed on a
 * failed upload.
 */
export const buildAndUploadDebugSketch = async (
  projectDir: string,
  documents: readonly IProjectDocument[],
  fqbn: string,
  port: string,
  drivers: readonly ILoadedDriver[] = [],
): Promise<TArduinoDebugUploadOutcome> => {
  const built = await buildSketchCode(documents, drivers, true);
  if (!built.ok) return { stage: 'compile-error', message: built.message };
  const extraFiles: ISketchExtraFile[] = [
    { relativePath: FALANG_DEBUG_HEADER_FILENAME, content: built.debugHeader ?? '' },
    ...collectDriverExtraFiles(drivers, built.usedDriverIds),
  ];
  const sketchDir = await writeSketchFiles(sketchBuildDir(projectDir), SKETCH_NAME, built.code, extraFiles);
  const result = await uploadSketch({ sketchDir, fqbn, port });
  return { stage: 'cli', result, debugMap: built.debugMap ?? { tracePoints: [] } };
};
