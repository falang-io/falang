import { ConflictException } from '@nestjs/common';

interface IListsRunners {
  listRunning(): Promise<readonly { readonly projectId: string; readonly env: 'dev' | 'prod' }[]>;
}

interface IListsOwnedProjects {
  list(ownerId: string): Promise<readonly { readonly id: string }[]>;
}

interface IResolvesDevPodLimit {
  getLimits(userId: string): Promise<{ readonly maxDevPods: number }>;
}

/**
 * Security audit P1-3: caps the dev runner pods one owner has running at once across all their projects
 * (`UserLimitsService` `maxDevPods`, env `MAX_DEV_PODS`). Called right before a dev pod would be created; the project's
 * *own* pod (a dev rebuild replaces it) is not counted. Throws `409 { code: 'dev_pod_limit' }`.
 */
export const assertUnderDevPodLimit = async (
  deps: { readonly runners: IListsRunners; readonly projects: IListsOwnedProjects; readonly limits: IResolvesDevPodLimit },
  projectId: string,
  ownerId: string,
): Promise<void> => {
  const { maxDevPods } = await deps.limits.getLimits(ownerId);
  const ownedProjects = await deps.projects.list(ownerId);
  const owned = new Set(ownedProjects.map((project) => project.id));
  const running = await deps.runners.listRunning();
  const others = new Set(
    running
      .filter((runner) => runner.env === 'dev' && runner.projectId !== projectId && owned.has(runner.projectId))
      .map((runner) => runner.projectId),
  );
  if (others.size >= maxDevPods) {
    throw new ConflictException({
      code: 'dev_pod_limit',
      message: `You already have ${others.size} dev server(s) running (limit: ${maxDevPods}) — stop one before starting another`,
    });
  }
};
