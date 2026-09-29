import type { ProjectCommit } from './project-commit.entity.js';

/**
 * Orders a project's commits newest-first by walking the real `parentId` chain from its tip,
 * rather than trusting `created_at` alone. Needed because `created_at`'s resolution isn't fine
 * enough to break ties reliably — confirmed by the in-memory sqlite test harness, where two commits
 * created a few milliseconds apart (`better-sqlite3`'s `CURRENT_TIMESTAMP` default is second-grained)
 * can carry an *identical* `created_at`, at which point `ORDER BY created_at DESC` alone returns
 * them in an arbitrary order — real, live-verified behavior, not a hypothetical. The chain itself is
 * unaffected by clock resolution: `writeCommit` always sets a new commit's `parentId` to whatever
 * `headCommitRow` returned right before it, so walking `parentId` backward from the one commit
 * nobody points to (the "tip") reconstructs the true history regardless of timestamps.
 */
export const orderCommitsNewestFirst = (commits: readonly ProjectCommit[]): ProjectCommit[] => {
  if (commits.length === 0) return [];
  const byId = new Map(commits.map((commit) => [commit.id, commit]));
  const referencedAsParent = new Set(
    commits.map((commit) => commit.parentId).filter((id): id is string => id !== null),
  );
  const tip = commits.find((commit) => !referencedAsParent.has(commit.id)) ?? null;

  const ordered: ProjectCommit[] = [];
  const visited = new Set<string>();
  let current = tip;
  while (current && !visited.has(current.id)) {
    ordered.push(current);
    visited.add(current.id);
    current = current.parentId ? (byId.get(current.parentId) ?? null) : null;
  }

  // Defensive only: every commit this service writes forms one linear chain, so every row should be
  // reachable from the tip. A commit left over here (a real fork/cycle, or bad data) is appended by
  // `created_at` — best-effort, rather than silently dropping it from `listCommits`.
  const strandedByCreatedAt = commits
    .filter((commit) => !visited.has(commit.id))
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return [...ordered, ...strandedByCreatedAt];
};
