import { describe, expect, it } from 'vitest';
import { resolveServerActivity, type IServerActivityState } from './server-activity.js';

const idle: IServerActivityState = {
  buildStatus: 'idle',
  isRestarting: false,
  isPublishing: false,
  isProdActionLoading: false,
  prodRunning: false,
};

describe('resolveServerActivity', () => {
  it('is null when nothing is in flight', () => {
    expect(resolveServerActivity(idle)).toBeNull();
    expect(resolveServerActivity({ ...idle, buildStatus: 'running' })).toBeNull();
    expect(resolveServerActivity({ ...idle, buildStatus: 'error' })).toBeNull();
  });

  it('reports dev start and stop', () => {
    expect(resolveServerActivity({ ...idle, buildStatus: 'building' })).toBe('dev-starting');
    expect(resolveServerActivity({ ...idle, buildStatus: 'stopping' })).toBe('dev-stopping');
  });

  it('reports a restart through both of its phases', () => {
    expect(resolveServerActivity({ ...idle, isRestarting: true, buildStatus: 'stopping' })).toBe('dev-restarting');
    expect(resolveServerActivity({ ...idle, isRestarting: true, buildStatus: 'building' })).toBe('dev-restarting');
    expect(resolveServerActivity({ ...idle, isRestarting: true, buildStatus: 'running' })).toBeNull();
  });

  it('tells prod start from stop by the state before the action', () => {
    expect(resolveServerActivity({ ...idle, isProdActionLoading: true })).toBe('prod-starting');
    expect(resolveServerActivity({ ...idle, isProdActionLoading: true, prodRunning: true })).toBe('prod-stopping');
  });

  it('puts publishing first', () => {
    expect(resolveServerActivity({ ...idle, isPublishing: true, buildStatus: 'building' })).toBe('publishing');
  });
});
