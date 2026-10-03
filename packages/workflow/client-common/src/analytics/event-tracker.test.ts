import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventTracker, type IEventTrackerHandler } from './event-tracker.js';

afterEach(() => vi.restoreAllMocks());

describe('EventTracker', () => {
  it('is a no-op without a handler', () => {
    const tracker = new EventTracker();
    expect(() => {
      tracker.track('login');
      tracker.identify('u1');
    }).not.toThrow();
  });

  it('forwards events, props and identify to the handler', () => {
    const handler = { track: vi.fn(), identify: vi.fn() };
    const tracker = new EventTracker();
    tracker.setHandler(handler);
    tracker.track('project_created', { fromTemplate: false });
    tracker.identify('u1');
    expect(handler.track).toHaveBeenCalledWith('project_created', { fromTemplate: false });
    expect(handler.identify).toHaveBeenCalledWith('u1');
  });

  it('swallows handler exceptions and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => null as never);
    const tracker = new EventTracker();
    tracker.setHandler({
      track: () => {
        throw new Error('boom');
      },
      identify: () => {
        throw new Error('boom');
      },
    });
    expect(() => tracker.track('signup')).not.toThrow();
    expect(() => tracker.identify('u1')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('works when the handler has no identify', () => {
    const handler: IEventTrackerHandler = { track: vi.fn() };
    const tracker = new EventTracker();
    tracker.setHandler(handler);
    expect(() => tracker.identify('u1')).not.toThrow();
  });

  it('stops tracking after setHandler(null)', () => {
    const handler = { track: vi.fn() };
    const tracker = new EventTracker();
    tracker.setHandler(handler);
    tracker.setHandler(null);
    tracker.track('login');
    expect(handler.track).not.toHaveBeenCalled();
  });
});
