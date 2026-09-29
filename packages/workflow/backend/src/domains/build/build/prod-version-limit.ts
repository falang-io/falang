import { ConflictException } from '@nestjs/common';

interface ICountsRunningVersions {
  countRunning(taskQueue: string): Promise<number>;
}

/**
 * Throws if `taskQueue` already has `limit` (or more) versions running — see `BuildService`'s
 * `maxConcurrentProdVersions` (resolved per project owner through `UserLimitsService`) doc comment for why this lives here, app-level, rather than as a k8s
 * `ResourceQuota` object.
 */
export const assertUnderProdVersionLimit = async (
  manager: ICountsRunningVersions,
  taskQueue: string,
  limit: number,
): Promise<void> => {
  const running = await manager.countRunning(taskQueue);
  if (running >= limit) {
    throw new ConflictException(
      `Project already has ${running} published version(s) running (limit: ${limit}) — stop one before starting another`,
    );
  }
};

interface IResolvesProjectOwner {
  getOwnerId(projectId: string): Promise<string>;
}

interface IResolvesUserLimits {
  getLimits(userId: string): Promise<{ readonly maxConcurrentProdVersions: number }>;
}

/**
 * The cap for `projectId`, resolved through the project's *owner* (never the calling user — same
 * rule as `FilesService`): the owner's `user_limits` override, else the `MAX_CONCURRENT_PROD_VERSIONS`
 * env default, both merged by `UserLimitsService`.
 */
export const resolveProdVersionLimit = async (
  projects: IResolvesProjectOwner,
  userLimits: IResolvesUserLimits,
  projectId: string,
): Promise<number> => {
  const ownerId = await projects.getOwnerId(projectId);
  const limits = await userLimits.getLimits(ownerId);
  return limits.maxConcurrentProdVersions;
};
