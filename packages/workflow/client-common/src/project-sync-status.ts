import { runInAction } from 'mobx';
import { workflowApi } from './api-client.js';
import type { TBuildStatus } from './project-sync.js';

/**
 * `ProjectSync`'s two page-load "restore last known state" fetches, split out to keep that file
 * under the repo's 300-line lint cap — pure functions taking just what they need to mutate, called
 * once from the constructor.
 */

/** Restores `buildStatus` on mount so a page refresh doesn't show "Not running" for a dev runner the backend actually still has up — see `BuildService.getDevStatus`. Best-effort only: a failed request leaves `buildStatus` at its `'idle'` default. */
export const loadDevStatus = async (
  projectId: string,
  getBuildStatus: () => TBuildStatus,
  setBuildStatus: (status: TBuildStatus) => void,
): Promise<void> => {
  try {
    const status = await workflowApi.getDevStatus(projectId);
    runInAction(() => {
      // Guard against clobbering a state change (e.g. a manual Build/Stop click) that happened to
      // land while this request was in flight.
      if (getBuildStatus() === 'idle' && status.running) setBuildStatus('running');
    });
  } catch {
    // Best-effort restore only.
  }
};

/** Restores prod running state + whether any version exists, for the toolbar's Prod menu — mirrors `loadDevStatus` above. */
export const loadProdStatus = async (
  projectId: string,
  onLoaded: (prodRunning: boolean, hasVersions: boolean) => void,
): Promise<void> => {
  try {
    const [status, versions] = await Promise.all([
      workflowApi.getProdStatus(projectId),
      workflowApi.listVersions(projectId),
    ]);
    runInAction(() => {
      onLoaded(status.running, versions.length > 0);
    });
  } catch {
    // Best-effort restore only.
  }
};
