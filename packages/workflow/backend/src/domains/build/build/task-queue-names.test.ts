import { describe, expect, it } from 'vitest';
import { devTaskQueue, parseDevTaskQueue, prodTaskQueue } from './task-queue-names.js';

describe('parseDevTaskQueue', () => {
  it('recovers projectId from a dev task queue name', () => {
    expect(parseDevTaskQueue(devTaskQueue('project-1'))).toBe('project-1');
  });

  it('recovers a UUID-shaped projectId (hyphens included) unchanged', () => {
    const projectId = '123e4567-e89b-12d3-a456-426614174000';
    expect(parseDevTaskQueue(devTaskQueue(projectId))).toBe(projectId);
  });

  it('returns null for a prod task queue name', () => {
    expect(parseDevTaskQueue(prodTaskQueue('project-1'))).toBeNull();
  });

  it('returns null for a versioned prod deployment name (taskQueue-buildId)', () => {
    expect(parseDevTaskQueue(`${prodTaskQueue('project-1')}-v1`)).toBeNull();
  });

  it('returns null for an unrelated name', () => {
    expect(parseDevTaskQueue('something-else')).toBeNull();
  });
});
