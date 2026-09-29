import ts from 'typescript';

/**
 * Transpiles a compiled activities module (see `@falang/workflow-compiler`'s `compileActivities`)
 * from TypeScript to plain CommonJS JavaScript — the format a runner pod's in-memory `Module`-based
 * loader needs, since it evaluates the source directly via `Module._compile()` with no TS transform
 * step of its own (see ADR 0016 (private)'s "Artifact delivery into
 * the runner pod"). `ts.transpileModule` only strips types/lowers syntax, it doesn't type-check —
 * that's already covered by `compileProjectDocuments`' real `ts.Program` run (`type-check-project.ts`),
 * so redoing it here would be redundant.
 *
 * Not yet wired into `BuildService` — see `bundle-workflow-code.ts`'s note on why.
 */
export const transpileActivitiesToCjs = (activitiesSource: string): string =>
  ts.transpileModule(activitiesSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
