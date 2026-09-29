/**
 * The output shape of a multi-file project compiler (`compileTsProject`, `compileRustProject`): every
 * key is a POSIX-style path relative to the export directory (`mod.rs`, `State.rs`, `_falang.ts`, …),
 * every value that file's full contents. `@falang/logic-export` writes them verbatim under the
 * configured export path. Single-translation-unit targets (cpp/Go/C#) keep returning a plain string.
 */
export interface ICompiledProjectFiles {
  readonly files: Readonly<Record<string, string>>;
}
