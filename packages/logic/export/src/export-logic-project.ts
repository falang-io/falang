import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import type { ILogicExportConfigurationItem, TExportLanguage } from '@falang/logic-dto';
import type { ICompiledProjectFiles } from '@falang/logic-constructor';
import {
  compileCppProject,
  compileGoProject,
  compileRustProject,
  compileSharpProject,
  compileTsProject,
  CppProjectCompileError,
  GoProjectCompileError,
  RustProjectCompileError,
  SharpProjectCompileError,
  TsProjectCompileError,
} from '@falang/logic-constructor';

/** One item finished (successfully or not) — `done` counts completed items, 1-based, so `done === total` means this was the last one. Reported synchronously as each item resolves, in `exports` order. */
export interface ILogicExportProgress {
  readonly done: number;
  readonly total: number;
  readonly language: TExportLanguage;
  readonly path: string;
}

export interface IExportLogicProjectParams {
  /** The project's root directory — relative `ILogicExportConfigurationItem.path`s resolve against it (the old app resolved them against the project root the same way). */
  readonly projectDir: string;
  /** The project's full document set, in-memory state included — the same input every `compile*Project` takes; non-`function`/structure documents are skipped by the compilers themselves. */
  readonly documents: readonly IProjectDocument[];
  readonly exports: readonly ILogicExportConfigurationItem[];
  /** Called once per item, after it settles (see `ILogicExportProgress`) — lets a caller running this
   * off the main thread (see ADR 0019 (private)'s "Implementation notes (export worker …)") surface
   * a progress bar instead of one opaque "exporting…" spinner for the whole run. */
  readonly onProgress?: (progress: ILogicExportProgress) => void;
}

export interface ILogicExportError {
  readonly documentId?: string;
  readonly documentName?: string;
  readonly nodeId?: string;
  readonly message: string;
}

export interface ILogicExportItemResult {
  readonly language: TExportLanguage;
  /** The configured path as given in the configuration (relative or absolute). */
  readonly path: string;
  /** Where the output actually went — `path` resolved against `projectDir`. */
  readonly outputDir: string;
  readonly ok: boolean;
  /** Absolute paths of every file written; empty when `ok` is false (nothing is written for a failed item — no partial output). */
  readonly files: readonly string[];
  readonly errors: readonly ILogicExportError[];
}

export interface ILogicExportResult {
  readonly items: readonly ILogicExportItemResult[];
}

/**
 * A single-translation-unit compiler (`compile` returns a plain `string`, written to the one file
 * named `fileName`) or a multi-file one (`compile` returns `ICompiledProjectFiles` — Contract 2 of
 * ADR 0019 (private)'s "TypeScript target"/"Rust target" implementation notes, every entry written
 * under `outputDir`). A discriminated union on `kind` (rather than `fileName?: string` plus a
 * `typeof result === 'string'` check in `exportOne`) so the file-writing branch below never needs a
 * non-null assertion to recover `fileName` — neither path ever deletes a stale file that isn't part of
 * this compile's own output.
 */
type IProjectCompiler =
  | {
      readonly kind: 'single';
      readonly fileName: string;
      readonly compile: (params: { readonly documents: readonly IProjectDocument[] }) => string;
    }
  | {
      readonly kind: 'multi';
      readonly compile: (params: { readonly documents: readonly IProjectDocument[] }) => ICompiledProjectFiles;
    };

/**
 * One compiler per supported target. cpp/Go/C# each emit a single self-contained source file, named
 * after the product rather than the project (a project's name is free text, not an identifier) — no
 * entry point is requested (`entryDocumentId` left unset): exported code is a library the user's own
 * program links against, matching the old app's `add_library(falang STATIC …)` output, not a runnable
 * `main`. TS and Rust instead emit one file per document (Contract 2/4/3 of ADR 0019 (private)) —
 * `fileName` is omitted for both, and `exportOne` writes every entry of their `ICompiledProjectFiles`
 * result under `outputDir` instead of one hardcoded name.
 */
const PROJECT_COMPILERS: Partial<Record<TExportLanguage, IProjectCompiler>> = {
  cpp: { kind: 'single', fileName: 'falang.cpp', compile: compileCppProject },
  golang: { kind: 'single', fileName: 'falang.go', compile: compileGoProject },
  rust: { kind: 'multi', compile: compileRustProject },
  sharp: { kind: 'single', fileName: 'Falang.cs', compile: compileSharpProject },
  ts: { kind: 'multi', compile: compileTsProject },
};

export const isLogicExportLanguageSupported = (language: TExportLanguage): boolean => language in PROJECT_COMPILERS;

const isProjectCompileError = (
  error: unknown,
): error is
  | CppProjectCompileError
  | GoProjectCompileError
  | RustProjectCompileError
  | SharpProjectCompileError
  | TsProjectCompileError =>
  error instanceof CppProjectCompileError ||
  error instanceof GoProjectCompileError ||
  error instanceof RustProjectCompileError ||
  error instanceof SharpProjectCompileError ||
  error instanceof TsProjectCompileError;

const errorsOf = (error: unknown): readonly ILogicExportError[] => {
  if (isProjectCompileError(error)) return error.errors;
  return [{ message: error instanceof Error ? error.message : String(error) }];
};

const exportOne = async (
  projectDir: string,
  documents: readonly IProjectDocument[],
  item: ILogicExportConfigurationItem,
): Promise<ILogicExportItemResult> => {
  const outputDir = path.resolve(projectDir, item.path);
  const base = { language: item.language, path: item.path, outputDir };
  const compiler = PROJECT_COMPILERS[item.language];
  if (!compiler) {
    return {
      ...base,
      ok: false,
      files: [],
      errors: [
        {
          message: `Exporting to "${item.language}" is not supported yet — only ${Object.keys(PROJECT_COMPILERS).join(', ')} have a project-level compiler (see ADR 0019 (private))`,
        },
      ],
    };
  }
  try {
    await fs.mkdir(outputDir, { recursive: true });
    if (compiler.kind === 'single') {
      const code = compiler.compile({ documents });
      const filePath = path.join(outputDir, compiler.fileName);
      await fs.writeFile(filePath, code);
      return { ...base, ok: true, files: [filePath], errors: [] };
    }
    // Multi-file result (Contract 2 of ADR 0019 (private)) — every entry of `result.files` is
    // written under `outputDir`, never anything deleted first, so a stale file from a previous export
    // that the current compile no longer produces is simply left alone.
    const result = compiler.compile({ documents });
    const filePaths = await Promise.all(
      Object.entries(result.files).map(async ([name, content]) => {
        const filePath = path.join(outputDir, name);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
        return filePath;
      }),
    );
    return { ...base, ok: true, files: filePaths, errors: [] };
  } catch (error) {
    // A failed item (compile error, unwritable path, …) never stops the other items — same
    // "don't let one broken thing hide every other" posture the project compilers themselves take
    // across documents.
    return { ...base, ok: false, files: [], errors: errorsOf(error) };
  }
};

/**
 * Runs every configured export: compiles the project once per item with that item's language and
 * writes the result under `<projectDir>/<item.path>` (created if missing). Never throws for a
 * per-item failure — inspect each `ILogicExportItemResult.ok`/`errors` instead.
 */
export const exportLogicProject = async ({
  projectDir,
  documents,
  exports,
  onProgress,
}: IExportLogicProjectParams): Promise<ILogicExportResult> => {
  // Sequential, not `Promise.all`: each `compiler.compile()` call is synchronous CPU-bound work (a
  // real `ts.Program` per target, see ADR 0019 (private)), so running them "concurrently" bought no
  // actual parallelism anyway — only a non-deterministic-looking one-big-blocking-stretch with no place
  // to report progress from. A `for` loop gives `onProgress` a well-defined "N of M done" callback and
  // yields to the event loop between items (the `await` on each item's own `fs` calls), which matters
  // when this whole function runs inside a worker process a caller wants to `cancel()` mid-export (see
  // `@falang/desktop-worker-process`) — cancellation there kills the process outright regardless, but a
  // yield point here at least keeps a same-process caller's own event loop from starving entirely.
  const items: ILogicExportItemResult[] = [];
  for (const [index, item] of exports.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- deliberately sequential, see comment above.
    const itemResult = await exportOne(projectDir, documents, item);
    items.push(itemResult);
    onProgress?.({ done: index + 1, total: exports.length, language: item.language, path: item.path });
  }
  return { items };
};
