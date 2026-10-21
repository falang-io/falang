import ts from 'typescript';

/**
 * Runs a project compiled by `compileTsProject` for real — no Docker, no toolchain beyond TypeScript itself: every
 * generated file is transpiled to CommonJS and loaded through a tiny in-memory `require`, then the entry function is
 * called with an empty `_falangGlobal`. Returns what the program printed through `console.log`, one entry per call
 * (split on newlines like the other targets' stdout).
 */
export const runTsProject = async (
  files: Readonly<Record<string, string>>,
  entryFunctionName: string,
): Promise<string[]> => {
  const printed: string[] = [];
  const fakeConsole = {
    log: (...args: unknown[]): void => {
      printed.push(args.map(String).join(' '));
    },
  };
  const cache = new Map<string, Record<string, unknown>>();

  const load = (fileName: string): Record<string, unknown> => {
    const cached = cache.get(fileName);
    if (cached) return cached;
    const source = files[fileName];
    if (typeof source !== 'string') throw new Error(`Generated TS project has no file ${fileName}`);
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const module = { exports: {} as Record<string, unknown> };
    cache.set(fileName, module.exports);
    const localRequire = (specifier: string): Record<string, unknown> => load(`${specifier.replace(/^\.\//, '')}.ts`);
    // oxlint-disable-next-line no-new-func -- the generated project is loaded the way a CommonJS module would be
    new Function('require', 'exports', 'module', 'console', outputText)(
      localRequire,
      module.exports,
      module,
      fakeConsole,
    );
    return module.exports;
  };

  const entryFile = Object.keys(files).find((fileName) =>
    new RegExp(`export async function ${entryFunctionName}\\b`).test(files[fileName]),
  );
  if (!entryFile) throw new Error(`No generated file exports ${entryFunctionName}`);
  const entry = load(entryFile)[entryFunctionName] as (params: unknown) => Promise<unknown>;
  await entry({ _falangGlobal: { apis: {} } });
  return printed.flatMap((entry_) => entry_.split('\n'));
};
