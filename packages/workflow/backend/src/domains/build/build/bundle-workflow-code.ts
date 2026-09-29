import { bundleWorkflowCode as temporalBundleWorkflowCode } from '@temporalio/worker';

/**
 * Pre-bundles a compiled workflows module into a single webpack bundle string, so a runner pod can
 * hand it straight to `Worker.create({ workflowBundle: { code } })` at pod start without ever
 * invoking Temporal's own bundler itself — see ADR 0016 (private)'s
 * "Artifact delivery into the runner pod". `workflowsPath` must already be written to disk inside a
 * node_modules-resolvable tree (same constraint `Worker.create({ workflowsPath })` has today, see
 * ADR 0002 (private)), since Temporal's bundler resolves
 * `@temporalio/workflow` via real Node module resolution starting from that path.
 *
 * Not yet wired into `BuildService` — the runner pod side of this (fetch-and-load-in-memory instead
 * of `WORKFLOWS_PATH`/`ACTIVITIES_PATH`) lands together with `RunnerProcessManager`'s move to k8s
 * `Deployment`s, per the ADR's own phase bullet list.
 */
export const bundleWorkflowCode = async (workflowsPath: string): Promise<string> => {
  const { code } = await temporalBundleWorkflowCode({ workflowsPath });
  return code;
};
