import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface IPushCoverageParams {
  /** `NODE_V8_COVERAGE`'s own directory — where `v8.takeCoverage()` (called just before this) wrote this process's coverage file(s). */
  readonly coverageDir: string;
  /** Reachable from inside the k8s cluster — see `fetch-artifact.ts`'s `artifactBaseUrl` doc comment. */
  readonly artifactBaseUrl: string;
  readonly projectId: string;
  readonly internalProjectToken: string;
}

const INTERNAL_PROJECT_TOKEN_HEADER = 'x-internal-project-token';

/** Node's own `NODE_V8_COVERAGE` output files, as opposed to source-map-cache files a coverage tool may also drop in the same directory (see `monocart-coverage-reports`' `readFromDir`, which the same filter mirrors). */
const isCoverageFile = (name: string): boolean => name.startsWith('coverage-') && name.endsWith('.json');

/**
 * Pushes this pod's own `NODE_V8_COVERAGE` output to `backend`'s internal coverage endpoint before
 * the pod terminates — see ADR 0016 (private)'s "Runner-pod coverage
 * collection" implementation notes. The coverage file `v8.takeCoverage()` just wrote lives on this
 * pod's `/tmp` `emptyDir` volume, gone the instant the pod is deleted, so it has to leave the pod
 * over HTTP like every other piece of pod state in this design (mirrors `fetch-artifact.ts`'s
 * inbound counterpart). Best-effort: called from a `SIGTERM` handler racing the pod's termination
 * grace period, so a failed push is logged by the caller, never retried.
 */
export const pushCoverage = async (params: IPushCoverageParams): Promise<void> => {
  const entries = await readdir(params.coverageDir).catch(() => [] as string[]);
  const files = entries.filter((name) => isCoverageFile(name));
  if (files.length === 0) return;

  const url = new URL(`/internal/coverage/${params.projectId}`, params.artifactBaseUrl);
  await Promise.all(
    files.map(async (name) => {
      const content = await readFile(join(params.coverageDir, name), 'utf8');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [INTERNAL_PROJECT_TOKEN_HEADER]: params.internalProjectToken },
        body: content,
      });
      if (!response.ok) {
        throw new Error(
          `Failed to push coverage file "${name}" to ${url.toString()}: ${response.status} ${await response.text()}`,
        );
      }
    }),
  );
};
