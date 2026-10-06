import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  JOURNAL_INTERCEPTORS_FILENAME,
  JOURNAL_INTERCEPTORS_MODULE,
  needsJournalInterceptors,
  type ICompileError,
} from '@falang/workflow-compiler';
import { assertSafeGeneratedModules } from './assert-safe-generated-modules.js';
import { bundleWorkflowCode } from './bundle-workflow-code.js';
import { transpileActivitiesToCjs } from './transpile-activities-to-cjs.js';
import { typeCheckProject } from './type-check-project.js';

/** What `BuildService` hands the disposable build process (see `build-worker-pool.ts`). */
export interface IBuildJob {
  readonly workflows: string;
  readonly activities: string;
  /** A fresh, empty directory inside the repo's `node_modules`-resolvable tree, owned (created and removed) by the parent — only used when `bundle` is set. */
  readonly workDir: string;
  /** Also bundle `workflows` and transpile `activities` after a clean type-check. Off for the code-preview (`generateCode`), which only needs diagnostics. */
  readonly bundle: boolean;
}

export type TBuildJobResult =
  | { readonly kind: 'errors'; readonly errors: readonly ICompileError[] }
  | { readonly kind: 'checked' }
  | { readonly kind: 'built'; readonly workflowBundle: string; readonly activitiesSource: string };

/**
 * The CPU/memory-heavy half of a build — type-check (a real `ts.Program`), webpack bundle, activity
 * transpile — which runs inside the disposable child process (`build-worker.ts`), never in the
 * backend's own event loop. Re-runs the generated-module safety check first as defence in depth: the
 * parent already ran it, but this process is the one that actually reads files.
 */
export const runBuildJob = async (job: IBuildJob): Promise<TBuildJobResult> => {
  const unsafe = assertSafeGeneratedModules(job.workflows, job.activities);
  if (unsafe.length > 0) return { kind: 'errors', errors: unsafe };

  const typeErrors = typeCheckProject(job.workflows, job.activities);
  if (typeErrors.length > 0) return { kind: 'errors', errors: typeErrors };
  if (!job.bundle) return { kind: 'checked' };

  mkdirSync(job.workDir, { recursive: true });
  const workflowsPath = join(job.workDir, 'workflows.ts');
  writeFileSync(workflowsPath, job.workflows, 'utf8');
  // Run-journal node-id header interceptor (ADR 0059 (private) §2b) — static text from the compiler,
  // written next to `workflows.ts` (it imports the position stack from './workflows') whenever the
  // build was compiled with position tracking, and bundled as a workflow interceptor module.
  const interceptorModules: string[] = [];
  if (needsJournalInterceptors(job.workflows)) {
    const interceptorsPath = join(job.workDir, JOURNAL_INTERCEPTORS_FILENAME);
    writeFileSync(interceptorsPath, JOURNAL_INTERCEPTORS_MODULE, 'utf8');
    interceptorModules.push(interceptorsPath);
  }
  const workflowBundle = await bundleWorkflowCode(workflowsPath, interceptorModules);
  const activitiesSource = transpileActivitiesToCjs(job.activities);
  return { kind: 'built', workflowBundle, activitiesSource };
};
