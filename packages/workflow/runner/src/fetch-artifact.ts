export interface IArtifactRef {
  /** Reachable from inside the k8s cluster — see `RunnerProcessManager`'s `internalApiUrl` doc comment. */
  readonly artifactBaseUrl: string;
  readonly projectId: string;
  readonly internalProjectToken: string;
  /** Set for a published version's pod, omitted for the unversioned dev pod — matches `backend`'s `internal-artifacts.controller.ts` route split. */
  readonly buildId?: string;
}

export interface IWorkflowArtifact {
  readonly workflowBundle: string;
  readonly activitiesSource: string;
}

const INTERNAL_PROJECT_TOKEN_HEADER = 'x-internal-project-token';

type TArtifactKind = 'workflow-bundle' | 'activities';

const artifactPathFor = (ref: IArtifactRef, kind: TArtifactKind): string =>
  ref.buildId
    ? `/internal/artifacts/versions/${ref.projectId}/${ref.buildId}/${kind}`
    : `/internal/artifacts/dev/${ref.projectId}/${kind}`;

const fetchArtifactPart = async (ref: IArtifactRef, kind: TArtifactKind): Promise<string> => {
  const url = new URL(artifactPathFor(ref, kind), ref.artifactBaseUrl);
  const response = await fetch(url, { headers: { [INTERNAL_PROJECT_TOKEN_HEADER]: ref.internalProjectToken } });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${kind} artifact from ${url.toString()}: ${response.status} ${await response.text()}`,
    );
  }
  return response.text();
};

/**
 * Fetches this pod's compiled artifact from `backend`'s internal artifact endpoints — see
 * ADR 0016 (private)'s "Artifact delivery into the runner pod".
 * Called once at startup (`start-runner.ts`); the result is handed straight to
 * `Worker.create({ workflowBundle: { code } })` and `load-cjs-module-from-source.ts` — never
 * written to this pod's own filesystem.
 */
export const fetchArtifact = async (ref: IArtifactRef): Promise<IWorkflowArtifact> => {
  const [workflowBundle, activitiesSource] = await Promise.all([
    fetchArtifactPart(ref, 'workflow-bundle'),
    fetchArtifactPart(ref, 'activities'),
  ]);
  return { workflowBundle, activitiesSource };
};
