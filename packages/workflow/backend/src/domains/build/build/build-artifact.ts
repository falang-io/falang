import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IDebugMap } from '@falang/debug';
import { bundleWorkflowCode } from './bundle-workflow-code.js';
import { transpileActivitiesToCjs } from './transpile-activities-to-cjs.js';

export interface IWorkflowArtifact {
  readonly workflowBundle: string;
  readonly activitiesSource: string;
  /** Only ever set on a dev artifact (see `DevArtifactStore`) — published artifacts are never debug-instrumented, see ADR 0021 (private) §5. Never served to a pod; `InternalArtifactsController` only ever reads `workflowBundle`/`activitiesSource` off this object. */
  readonly debugMap?: IDebugMap;
}

/**
 * Turns compiled `workflows`/`activities` TypeScript source (see `compile-project-documents.ts`)
 * into the in-memory-loadable artifact a runner pod fetches at startup — see
 * ADR 0016 (private)'s "Artifact delivery into the runner pod".
 * `bundleWorkflowCode()` needs `workflows` on disk, inside this repo's node_modules-resolvable
 * `outputDir` (see ADR 0002 (private)), to resolve
 * `@temporalio/workflow` — the file written here is scratch input to that call only; nothing reads
 * it afterward. Shared by `BuildService`'s `build()`/`publish()`.
 */
export const buildArtifact = async (outputDir: string, projectId: string, workflows: string, activities: string): Promise<IWorkflowArtifact> => {
  mkdirSync(outputDir, { recursive: true });
  const workflowsPath = join(outputDir, `${projectId}-${randomUUID()}.ts`);
  writeFileSync(workflowsPath, workflows, 'utf8');
  const workflowBundle = await bundleWorkflowCode(workflowsPath);
  const activitiesSource = transpileActivitiesToCjs(activities);
  return { workflowBundle, activitiesSource };
};
