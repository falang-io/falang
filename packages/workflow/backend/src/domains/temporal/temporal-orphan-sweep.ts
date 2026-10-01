import { projectIdFromNamespace } from './temporal-namespace.js';

/** A deleted project's namespace is kept this long before `DeleteNamespace` (irreversible) — time to roll back a mistaken delete (ADR 0050 (private)). */
export const ORPHAN_NAMESPACE_GRACE_MS = 24 * 60 * 60 * 1000;

/** Namespace name → ISO time it was first seen without a matching project. */
export type TOrphanMarks = Readonly<Record<string, string>>;

export interface IOrphanSweepDeps {
  readonly listNamespaces: () => Promise<readonly string[]>;
  readonly listProjectIds: () => Promise<readonly string[]>;
  readonly deleteNamespace: (namespace: string) => Promise<void>;
  readonly loadMarks: () => Promise<TOrphanMarks>;
  readonly saveMarks: (marks: TOrphanMarks) => Promise<void>;
  readonly now: () => number;
  readonly graceMs: number;
  readonly onError?: (namespace: string, error: unknown) => void;
}

export interface IOrphanSweepResult {
  readonly deleted: readonly string[];
  /** Orphaned now, grace period not over yet. */
  readonly pending: readonly string[];
}

/**
 * Deletes `falang-*` namespaces whose project no longer exists, but only once they have been orphaned
 * for `graceMs` — the first sweep that sees one just records it (persisted via `saveMarks`, so a
 * restart doesn't reset the clock). Never touches a namespace of a live project, nor anything that
 * isn't `falang-<id>` (`default`, `temporal-system`, …). A project that reappears (restored from a
 * backup) drops its mark.
 */
export const sweepOrphanedNamespaces = async (deps: IOrphanSweepDeps): Promise<IOrphanSweepResult> => {
  const [namespaces, projectIds, marks] = await Promise.all([
    deps.listNamespaces(),
    deps.listProjectIds(),
    deps.loadMarks(),
  ]);
  const live = new Set(projectIds);
  const now = deps.now();
  const nextMarks: Record<string, string> = {};
  const deleted: string[] = [];
  const pending: string[] = [];

  for (const namespace of namespaces) {
    const projectId = projectIdFromNamespace(namespace);
    if (projectId === null || live.has(projectId)) continue;
    const firstSeen = marks[namespace] ? Date.parse(marks[namespace]) : Number.NaN;
    if (Number.isNaN(firstSeen)) {
      nextMarks[namespace] = new Date(now).toISOString();
      pending.push(namespace);
      continue;
    }
    if (now - firstSeen < deps.graceMs) {
      nextMarks[namespace] = marks[namespace] as string;
      pending.push(namespace);
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- a handful of namespaces at most; sequential keeps load on Temporal flat.
      await deps.deleteNamespace(namespace);
      deleted.push(namespace);
    } catch (error) {
      deps.onError?.(namespace, error);
      nextMarks[namespace] = marks[namespace] as string;
    }
  }

  await deps.saveMarks(nextMarks);
  return { deleted, pending };
};
