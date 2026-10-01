import { BadRequestException } from '@nestjs/common';
import type { IProjectDocument } from '@falang/dto';
import { compileProject, ProjectCompileError, type ICompiledProject } from '@falang/workflow-compiler';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import type { ActivepiecesCatalogService } from '../../integrations/activepieces-catalog.service.js';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { assertSafeGeneratedModules } from './assert-safe-generated-modules.js';
import { typeCheckProject } from './type-check-project.js';

/** `REGISTERED_INTEGRATIONS` plus any dynamic ActivePieces vendors — see ADR 0011 (private). `compileProjectDocuments` needs the full list to resolve an ActivePieces trigger's `ITriggerDescriptor`. */
export const getIntegrationsForCompile = async (
  activepiecesCatalog: ActivepiecesCatalogService,
): Promise<readonly IWorkflowIntegration[]> => [
  ...REGISTERED_INTEGRATIONS,
  ...(await activepiecesCatalog.getDynamicIntegrations()),
];

export interface IGeneratedFile {
  /** Relative path, for display purposes only — not written to disk. */
  readonly path: string;
  readonly content: string;
}

/** Shared by every caller that needs to show a project's compiled modules by name — a successful `generateCode()`, and a failed `compileProjectDocuments` below (its best-effort partial output, so the user can see their code alongside the errors). */
export const toGeneratedFiles = (workflows: string, activities: string): IGeneratedFile[] => [
  { path: 'workflows.ts', content: workflows },
  { path: 'activities.ts', content: activities },
];

/** Runs `compileProject` and turns a `ProjectCompileError` (one entry per document that failed to compile) into a 400 the client can render as a list, instead of letting it bubble up as Nest's generic, message-swallowing 500 — the structural half of `compileProjectDocuments` below. */
const compileOrThrowBadRequest = (
  documents: readonly IProjectDocument[],
  integrations: readonly IWorkflowIntegration[],
  trackPosition: boolean,
  debug: boolean,
): ICompiledProject => {
  try {
    return compileProject({ documents, integrations, trackPosition, debug });
  } catch (error) {
    if (error instanceof ProjectCompileError) {
      throw new BadRequestException({
        message: 'Project failed to compile',
        errors: error.errors,
        files: toGeneratedFiles(error.workflows, error.activities),
      });
    }
    throw error;
  }
};

/**
 * `compileProjectStructure` + `compileProjectDocuments` below. Structurally compiles a project's documents (`compileOrThrowBadRequest`), then, only once that
 * succeeds, type-checks the result with a real `ts.Program` (`typeCheckProject`) and rejects the
 * same way if the generated TypeScript itself doesn't type-check — something `compileProject`
 * alone can't catch, since it only emits syntactically-valid code, never checks it. `compiled`'s
 * `doc-start`/`icon-start` marker comments (see `parse-compiled-markers.ts`) let a diagnostic's
 * line number be resolved back to the exact document/node responsible. Either rejection includes
 * `files` (the compiled/partially-compiled code) alongside `errors`, so the client can show both
 * together. Shared by `BuildService`'s `build`/`generateCode`/`publish`. `integrations` must include
 * both `REGISTERED_INTEGRATIONS` and any dynamic ones (ActivePieces vendors, see
 * ADR 0011 (private)) — `BuildService` merges them before calling this, so
 * a project using an ActivePieces trigger compiles without hitting `NodeCompileError` for an
 * "unregistered" trigger. `options.trackPosition` (default on) instruments the output for live
 * execution-position tracking — every real dev/published artifact has it; only `generateCode`'s
 * preview turns it off, so the code viewer shows the user's own logic without the runtime's noise
 * (ADR 0022 (private)). `options.debug` (default off) instruments the output for breakpoint
 * debugging (ADR 0021 (private)) — `BuildService.build()` (dev only) turns it on; `publish()` and
 * `generateCode()` never do, per the ADR's "dev always instrumented, published never" rule.
 */
export const compileProjectStructure = (
  documents: readonly IProjectDocument[],
  integrations: readonly IWorkflowIntegration[],
  options: { readonly trackPosition?: boolean; readonly debug?: boolean } = {},
): ICompiledProject => {
  const compiled = compileOrThrowBadRequest(documents, integrations, options.trackPosition ?? true, options.debug ?? false);

  // Before anything reads the generated modules (tsc, webpack): user text spliced into code must not
  // be able to load modules/files — see `assert-safe-generated-modules.ts` (security audit P0-7).
  const unsafe = assertSafeGeneratedModules(compiled.workflows, compiled.activities);
  if (unsafe.length > 0) {
    throw new BadRequestException({
      message: 'Project failed to compile',
      errors: unsafe,
      files: toGeneratedFiles(compiled.workflows, compiled.activities),
    });
  }
  return compiled;
};

/**
 * `compileProjectStructure` plus an in-process type-check. `BuildService` does NOT use this (it
 * type-checks in a disposable build process, `build-artifact.ts`); it stays for callers that want
 * the whole check synchronously — tests and tooling.
 */
export const compileProjectDocuments = (
  documents: readonly IProjectDocument[],
  integrations: readonly IWorkflowIntegration[],
  options: { readonly trackPosition?: boolean; readonly debug?: boolean } = {},
): ICompiledProject => {
  const compiled = compileProjectStructure(documents, integrations, options);

  const typeErrors = typeCheckProject(compiled.workflows, compiled.activities);
  if (typeErrors.length > 0) {
    throw new BadRequestException({
      message: 'Project failed to compile',
      errors: typeErrors,
      files: toGeneratedFiles(compiled.workflows, compiled.activities),
    });
  }

  return compiled;
};
