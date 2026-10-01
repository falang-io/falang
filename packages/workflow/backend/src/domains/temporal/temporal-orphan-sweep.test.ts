// oxlint-disable init-declarations, no-undefined, unicorn/no-useless-undefined -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import { describe, expect, it, vi } from 'vitest';
import {
  ORPHAN_NAMESPACE_GRACE_MS,
  sweepOrphanedNamespaces,
  type IOrphanSweepDeps,
  type TOrphanMarks,
} from './temporal-orphan-sweep.js';

const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const iso = (ms: number): string => new Date(ms).toISOString();

const setup = (overrides: Partial<IOrphanSweepDeps> & { marks?: TOrphanMarks } = {}) => {
  let saved: TOrphanMarks | undefined;
  const deleteNamespace = vi.fn().mockResolvedValue(undefined);
  const deps: IOrphanSweepDeps = {
    listNamespaces: () => Promise.resolve(['default', 'temporal-system', 'falang-live', 'falang-dead']),
    listProjectIds: () => Promise.resolve(['live']),
    deleteNamespace,
    loadMarks: () => Promise.resolve(overrides.marks ?? {}),
    saveMarks: (marks) => {
      saved = marks;
      return Promise.resolve();
    },
    now: () => NOW,
    graceMs: ORPHAN_NAMESPACE_GRACE_MS,
    ...overrides,
  };
  return { deps, deleteNamespace, saved: () => saved };
};

describe('sweepOrphanedNamespaces', () => {
  it('only marks a namespace the first time it sees it orphaned — nothing is deleted yet', async () => {
    const { deps, deleteNamespace, saved } = setup();

    const result = await sweepOrphanedNamespaces(deps);

    expect(result).toEqual({ deleted: [], pending: ['falang-dead'] });
    expect(deleteNamespace).not.toHaveBeenCalled();
    expect(saved()).toEqual({ 'falang-dead': iso(NOW) });
  });

  it('keeps a namespace orphaned for less than the grace period, preserving its original mark', async () => {
    const firstSeen = iso(NOW - ORPHAN_NAMESPACE_GRACE_MS + 60_000);
    const { deps, deleteNamespace, saved } = setup({ marks: { 'falang-dead': firstSeen } });

    const result = await sweepOrphanedNamespaces(deps);

    expect(result.deleted).toEqual([]);
    expect(deleteNamespace).not.toHaveBeenCalled();
    expect(saved()).toEqual({ 'falang-dead': firstSeen });
  });

  it('deletes a namespace once it has been orphaned for the full grace period and drops its mark', async () => {
    const { deps, deleteNamespace, saved } = setup({ marks: { 'falang-dead': iso(NOW - ORPHAN_NAMESPACE_GRACE_MS) } });

    const result = await sweepOrphanedNamespaces(deps);

    expect(result.deleted).toEqual(['falang-dead']);
    expect(deleteNamespace).toHaveBeenCalledExactlyOnceWith('falang-dead');
    expect(saved()).toEqual({});
  });

  it('never touches a live project namespace or a namespace that is not falang-*, however old its stale mark', async () => {
    const stale = iso(NOW - 10 * ORPHAN_NAMESPACE_GRACE_MS);
    const { deps, deleteNamespace, saved } = setup({
      marks: { 'falang-live': stale, default: stale, 'temporal-system': stale },
    });

    await sweepOrphanedNamespaces(deps);

    expect(deleteNamespace).not.toHaveBeenCalledWith('falang-live');
    expect(deleteNamespace).not.toHaveBeenCalledWith('default');
    expect(deleteNamespace).not.toHaveBeenCalledWith('temporal-system');
    // The live namespace's stale mark is cleared (a restored project starts fresh if it is ever deleted again).
    expect(saved()).toEqual({ 'falang-dead': iso(NOW) });
  });

  it('keeps the mark when the deletion fails, reports the error and carries on with the others', async () => {
    const onError = vi.fn();
    const deleteNamespace = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
    const old = iso(NOW - 2 * ORPHAN_NAMESPACE_GRACE_MS);
    const { deps, saved } = setup({
      listNamespaces: () => Promise.resolve(['falang-a', 'falang-b']),
      listProjectIds: () => Promise.resolve([]),
      deleteNamespace,
      marks: { 'falang-a': old, 'falang-b': old },
      onError,
    });

    const result = await sweepOrphanedNamespaces(deps);

    expect(result.deleted).toEqual(['falang-b']);
    expect(onError).toHaveBeenCalledWith('falang-a', expect.any(Error));
    expect(saved()).toEqual({ 'falang-a': old });
  });

  it('treats an unparseable mark as unseen', async () => {
    const { deps, saved } = setup({ marks: { 'falang-dead': 'garbage' } });

    await sweepOrphanedNamespaces(deps);

    expect(saved()).toEqual({ 'falang-dead': iso(NOW) });
  });
});
