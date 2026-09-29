import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import type { IDebugMap } from '@falang/debug';
import {
  checkArduinoCli,
  compileSketch,
  listBoards,
  uploadSketch,
  writeSketchFiles,
  type IArduinoCliStatus,
  type IConnectedBoard,
  type ISketchExtraFile,
} from '@falang/desktop-arduino-cli';
import type { TArduinoBuildOutcome } from '../shared/arduino-build-outcome.js';
import type { TArduinoDebugUploadOutcome } from '../shared/arduino-debug-outcome.js';
import { FALANG_DEBUG_HEADER_FILENAME } from './arduino-compiler/compile-arduino-project.js';
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
  | { readonly ok: false; readonly message: string };

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

/** The used drivers' own `sourceFiles` (headers + `.cpp`), resolved to absolute source paths — see ADR 0023 (private)'s Phase B/C "Artifact delivery" note. */
const collectDriverExtraFiles = (
  drivers: readonly ILoadedDriver[],
  usedDriverIds: ReadonlySet<string>,
): ISketchExtraFile[] =>
  drivers
    .filter((driver) => usedDriverIds.has(driver.config.id))
    .flatMap((driver) =>
      driver.config.sourceFiles.map((fileName) => ({
        relativePath: fileName,
        sourcePath: path.join(driver.dir, fileName),
      })),
    );

export const buildAndCompileSketch = async (
  projectDir: string,
  documents: readonly IProjectDocument[],
  fqbn: string,
  drivers: readonly ILoadedDriver[] = [],
): Promise<TArduinoBuildOutcome> => {
  const built = await buildSketchCode(documents, drivers);
  if (!built.ok) return { stage: 'compile-error', message: built.message };
  const extraFiles = collectDriverExtraFiles(drivers, built.usedDriverIds);
  const sketchDir = await writeSketchFiles(sketchBuildDir(projectDir), SKETCH_NAME, built.code, extraFiles);
  const result = await compileSketch({ sketchDir, fqbn });
  return { stage: 'cli', result };
};

export const buildAndUploadSketch = async (
  projectDir: string,
  documents: readonly IProjectDocument[],
  fqbn: string,
  port: string,
  drivers: readonly ILoadedDriver[] = [],
): Promise<TArduinoBuildOutcome> => {
  const built = await buildSketchCode(documents, drivers);
  if (!built.ok) return { stage: 'compile-error', message: built.message };
  const extraFiles = collectDriverExtraFiles(drivers, built.usedDriverIds);
  const sketchDir = await writeSketchFiles(sketchBuildDir(projectDir), SKETCH_NAME, built.code, extraFiles);
  const result = await uploadSketch({ sketchDir, fqbn, port });
  return { stage: 'cli', result };
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
