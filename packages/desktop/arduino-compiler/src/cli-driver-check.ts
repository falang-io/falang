import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkArduinoCli, compileSketch, writeSketchFiles } from '@falang/desktop-arduino-cli';
import type { IDriverCliCheckResult } from './driver-validation-types.js';

/**
 * The real stage-4 hook of `validateDriverBundle` (ADR 0054 (private) §4): compiles the synthetic sketch
 * with `arduino-cli` for the project's board. A missing CLI, a core that isn't installed or a third-party
 * library the machine doesn't have are *warnings* (the driver may well be fine — we just can't tell),
 * never errors; any other failure is the compiler's own output as an error. Definitive results are
 * memoized in a small in-memory LRU keyed by the sketch files + fqbn.
 */
const SKETCH_NAME = 'sketch';
const DEFAULT_CACHE_SIZE = 20;
const MAX_OUTPUT_CHARS = 6000;

export interface ICliCompileOutcome {
  readonly ok: boolean;
  readonly output: string;
}

export interface ICreateArduinoCliDriverCheckParams {
  readonly fqbn: string;
  /** Test seam; defaults to `@falang/desktop-arduino-cli`'s `compileSketch`. */
  readonly compile?: (params: { sketchDir: string; fqbn: string }) => Promise<ICliCompileOutcome>;
  /** Test seam; defaults to `checkArduinoCli`. */
  readonly isCliAvailable?: () => Promise<boolean>;
  /** Where the throwaway sketch folder is created; defaults to `os.tmpdir()`. */
  readonly tmpRoot?: string;
  readonly cacheSize?: number;
}

const PLATFORM_MISSING =
  /platform not installed|platform [^\n]*not found|unknown fqbn|core [^\n]*not installed|no platform/i;
const MISSING_HEADER = /fatal error: ([\w./+-]+): No such file or directory/g;

const hashSketch = (files: Readonly<Record<string, string>>, fqbn: string): string =>
  createHash('sha256')
    .update(JSON.stringify([fqbn, Object.entries(files).toSorted(([a], [b]) => a.localeCompare(b))]))
    .digest('hex');

const truncate = (text: string): string =>
  text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (truncated)` : text;

/** Turns a failed compile's output into warnings (can't be judged here) or errors (the driver's own fault). Exported for tests. */
export const classifyCliFailure = (
  output: string,
  sketchFileNames: readonly string[],
  fqbn: string,
): IDriverCliCheckResult => {
  if (PLATFORM_MISSING.test(output)) {
    return { warnings: [`arduino-cli check skipped: the core for "${fqbn}" is not installed`] };
  }
  const own = new Set(sketchFileNames.map((name) => path.basename(name)));
  const missing = [...output.matchAll(MISSING_HEADER)]
    .map((match) => match[1])
    .filter((h) => !own.has(path.basename(h)));
  if (missing.length > 0) {
    const unique = [...new Set(missing)];
    return {
      warnings: [`arduino-cli check skipped: library header(s) not installed on this machine: ${unique.join(', ')}`],
    };
  }
  return { errors: [truncate(output.trim() === '' ? 'arduino-cli compile failed with no output' : output.trim())] };
};

export const createArduinoCliDriverCheck = (
  params: ICreateArduinoCliDriverCheckParams,
): ((sketchFiles: Readonly<Record<string, string>>) => Promise<IDriverCliCheckResult>) => {
  const { fqbn } = params;
  const compile = params.compile ?? compileSketch;
  const isCliAvailable =
    params.isCliAvailable ??
    (async () => {
      const status = await checkArduinoCli();
      return status.available;
    });
  const tmpRoot = params.tmpRoot ?? os.tmpdir();
  const cacheSize = params.cacheSize ?? DEFAULT_CACHE_SIZE;
  const cache = new Map<string, IDriverCliCheckResult>();

  const remember = (key: string, value: IDriverCliCheckResult): void => {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > cacheSize) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  };

  return async (sketchFiles) => {
    const key = hashSketch(sketchFiles, fqbn);
    const hit = cache.get(key);
    if (hit) {
      remember(key, hit);
      return hit;
    }
    if (!(await isCliAvailable())) return { warnings: ['arduino-cli check skipped: arduino-cli was not found'] };

    const root = await fs.mkdtemp(path.join(tmpRoot, 'falang-driver-check-'));
    try {
      // `arduino-cli` wants the folder name to match the `.ino` — the synthetic sketch is `sketch.ino`.
      const extraFiles = Object.entries(sketchFiles)
        .filter(([name]) => name !== `${SKETCH_NAME}.ino`)
        .map(([relativePath, content]) => ({ relativePath, content }));
      const sketchDir = await writeSketchFiles(root, SKETCH_NAME, sketchFiles[`${SKETCH_NAME}.ino`] ?? '', extraFiles);
      const outcome = await compile({ sketchDir, fqbn });
      const result: IDriverCliCheckResult = outcome.ok
        ? {}
        : classifyCliFailure(outcome.output, Object.keys(sketchFiles), fqbn);
      // Warnings mean "couldn't judge" (machine-specific) — not worth pinning in the cache.
      if (!result.warnings || result.warnings.length === 0) remember(key, result);
      return result;
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  };
};
