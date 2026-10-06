import type { TBuildStatus } from './project-sync.js';

/** A long-running server-side action the workspace shows a top loading bar for. */
export type TServerActivity =
  | 'dev-starting'
  | 'dev-stopping'
  | 'dev-restarting'
  | 'publishing'
  | 'prod-starting'
  | 'prod-stopping';

export interface IServerActivityState {
  readonly buildStatus: TBuildStatus;
  readonly isRestarting: boolean;
  readonly isPublishing: boolean;
  readonly isProdActionLoading: boolean;
  /** Still the state from before the prod action while it is loading, so it tells start from stop. */
  readonly prodRunning: boolean;
}

/**
 * Which action is in flight, `null` when none. A restart is one activity from the stop through the rebuild; publishing
 * wins over the dev states (it is the slower, explicit action the user just asked for).
 */
export const resolveServerActivity = (state: IServerActivityState): TServerActivity | null => {
  if (state.isPublishing) return 'publishing';
  if (state.isProdActionLoading) return state.prodRunning ? 'prod-stopping' : 'prod-starting';
  if (state.isRestarting && (state.buildStatus === 'stopping' || state.buildStatus === 'building')) {
    return 'dev-restarting';
  }
  if (state.buildStatus === 'building') return 'dev-starting';
  if (state.buildStatus === 'stopping') return 'dev-stopping';
  return null;
};
