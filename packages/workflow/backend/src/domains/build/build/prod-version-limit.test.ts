import { describe, expect, it, vi } from 'vitest';
import { assertUnderProdVersionLimit, resolveProdVersionLimit } from './prod-version-limit.js';

describe('assertUnderProdVersionLimit', () => {
  it('resolves when fewer versions are running than the limit', async () => {
    const manager = { countRunning: vi.fn().mockResolvedValue(1) };
    await expect(assertUnderProdVersionLimit(manager, 'workflow-1', 3)).resolves.toBeUndefined();
    expect(manager.countRunning).toHaveBeenCalledWith('workflow-1');
  });

  it('throws once the running count reaches the limit', async () => {
    const manager = { countRunning: vi.fn().mockResolvedValue(3) };
    await expect(assertUnderProdVersionLimit(manager, 'workflow-1', 3)).rejects.toThrow(
      /already has 3 published version\(s\) running \(limit: 3\)/,
    );
  });

  it('throws when the running count already exceeds the limit', async () => {
    const manager = { countRunning: vi.fn().mockResolvedValue(5) };
    await expect(assertUnderProdVersionLimit(manager, 'workflow-1', 3)).rejects.toThrow(/limit: 3/);
  });
});

describe('resolveProdVersionLimit', () => {
  const projects = { getOwnerId: vi.fn().mockResolvedValue('owner-1') };
  const makeLimits = (byUser: Record<string, number>) => ({
    getLimits: vi.fn((userId: string) => Promise.resolve({ maxConcurrentProdVersions: byUser[userId] ?? 3 })),
  });

  it('uses the project owner override (1 blocks the second version)', async () => {
    const limits = makeLimits({ 'owner-1': 1 });
    const limit = await resolveProdVersionLimit(projects, limits, 'p1');
    expect(limits.getLimits).toHaveBeenCalledWith('owner-1');
    expect(limit).toBe(1);
    const manager = { countRunning: vi.fn().mockResolvedValue(1) };
    await expect(assertUnderProdVersionLimit(manager, 'q', limit)).rejects.toThrow(/limit: 1/);
  });

  it('falls back to the default (3) when the owner has no override', async () => {
    expect(await resolveProdVersionLimit(projects, makeLimits({}), 'p1')).toBe(3);
  });

  it("ignores a non-owner's limits", async () => {
    const limits = makeLimits({ 'someone-else': 1 });
    expect(await resolveProdVersionLimit(projects, limits, 'p1')).toBe(3);
    expect(limits.getLimits).not.toHaveBeenCalledWith('someone-else');
  });
});
