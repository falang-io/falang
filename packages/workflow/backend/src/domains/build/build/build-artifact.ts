import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { IDebugMap } from '@falang/debug';
import type { ICompileError } from '@falang/workflow-compiler';
import { runBuildWorker, type IBuildWorkerOptions } from './build-worker-pool.js';
import { toGeneratedFiles } from './compile-project-documents.js';

export interface IWorkflowArtifact {
  readonly workflowBundle: string;
  readonly activitiesSource: string;
  /** Only ever set on a dev artifact (see `DevArtifactStore`) — published artifacts are never debug-instrumented, see ADR 0021 (private) §5. Never served to a pod; `InternalArtifactsController` only ever reads `workflowBundle`/`activitiesSource` off this object. */
  readonly debugMap?: IDebugMap;
}

const BUILD_DIR_PREFIX = 'build-';

/**
 * Removes the `build-*` per-build directories a crashed backend left in `outputDir` (`buildArtifact` removes its own in
 * `finally`, which never runs when the whole process dies). Only directories with that exact prefix are touched.
 * Returns the removed names. Call once at startup, before any build starts.
 */
export const cleanupOrphanedBuildDirs = (outputDir: string): string[] => {
  if (!existsSync(outputDir)) return [];
  const removed: string[] = [];
  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(BUILD_DIR_PREFIX)) continue;
    rmSync(join(outputDir, entry.name), { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed;
};

const failedToCompile = (
  errors: readonly ICompileError[],
  workflows: string,
  activities: string,
): BadRequestException =>
  new BadRequestException({
    message: 'Project failed to compile',
    errors,
    files: toGeneratedFiles(workflows, activities),
  });

/**
 * Like `typeCheckInWorker` below but returns the type errors instead of throwing — the agent's
 * `check_project` endpoint (ADR 0062 (private)). Infra failures (worker crash/timeout) still reject.
 * Doc comment of the throwing variant follows.
 *
 * Type-checks compiled `workflows`/`activities` in a disposable build process (see
 * `build-worker-pool.ts`) instead of the backend's event loop — the code-preview's check. Throws the
 * same 400 `{ message, errors, files }` as a structural compile failure.
 */
export const typeCheckInWorkerErrors = async (
  workflows: string,
  activities: string,
  workerOptions: IBuildWorkerOptions = {},
): Promise<readonly ICompileError[]> => {
  const result = await runBuildWorker({ workflows, activities, workDir: '', bundle: false }, workerOptions);
  return result.kind === 'errors' ? result.errors : [];
};

export const typeCheckInWorker = async (
  workflows: string,
  activities: string,
  workerOptions: IBuildWorkerOptions = {},
): Promise<void> => {
  const result = await runBuildWorker({ workflows, activities, workDir: '', bundle: false }, workerOptions);
  if (result.kind === 'errors') throw failedToCompile(result.errors, workflows, activities);
};

/**
 * Turns compiled `workflows`/`activities` TypeScript source (see `compile-project-documents.ts`)
 * into the in-memory-loadable artifact a runner pod fetches at startup — see
 * ADR 0016 (private)'s "Artifact delivery into the runner pod". The type-check, webpack bundle and
 * activity transpile all run in one disposable child process (`runBuildWorker`).
 *
 * Temporal's bundler needs `workflows` on disk inside this repo's node_modules-resolvable tree
 * (see ADR 0002 (private)) to resolve `@temporalio/workflow`, so a fresh `mkdtemp` directory under
 * `outputDir` is created for this one build and removed in `finally`, success or not — nothing is
 * left behind for a later build's module resolver to see, and the artifact lives only in memory
 * (`DevArtifactStore`) or the database (`ProjectVersion`). Throws a 400 (same shape as
 * `compileProjectDocuments`) when the generated code does not type-check or is rejected by the
 * generated-module safety check. Shared by `BuildService`'s `build()`/`publish()`.
 */
export const buildArtifact = async (
  outputDir: string,
  workflows: string,
  activities: string,
  workerOptions: IBuildWorkerOptions = {},
): Promise<IWorkflowArtifact> => {
  mkdirSync(outputDir, { recursive: true });
  const workDir = mkdtempSync(join(outputDir, BUILD_DIR_PREFIX));
  try {
    const result = await runBuildWorker({ workflows, activities, workDir, bundle: true }, workerOptions);
    if (result.kind === 'errors') throw failedToCompile(result.errors, workflows, activities);
    if (result.kind !== 'built') throw new Error('Build process finished without producing an artifact');
    return { workflowBundle: result.workflowBundle, activitiesSource: result.activitiesSource };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};
