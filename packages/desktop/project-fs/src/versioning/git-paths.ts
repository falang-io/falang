import { promises as fs } from 'node:fs';
import * as nodeFs from 'node:fs';
import * as path from 'node:path';
import git from 'isomorphic-git';
import type { IGitVersioningOptions } from './git-version-store-types.js';

/**
 * The repository a `GitVersionStore` operation runs against, plus the project's own path relative
 * to that repository's root (posix-style, `''` when the repo root **is** the project directory —
 * both the `'private'` mode and an `'enclosing'` mode fallback land here).
 */
export interface IRepoContext {
  repoRoot: string;
  /** Posix-style, relative to `repoRoot`; `''` when `repoRoot === projectDir`. */
  projectRelDir: string;
}

/** Joins a posix-style git path fragment onto a (possibly empty) project-relative directory. */
export const joinGitPath = (projectRelDir: string, relPath: string): string =>
  projectRelDir === '' ? relPath : `${projectRelDir}/${relPath}`;

const toPosix = (value: string): string => value.split(path.sep).join('/');

export const pathExists = async (candidate: string): Promise<boolean> => {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
};

/**
 * Resolves which repository a project's git operations run against, per
 * ADR 0025 (private) ("Decisions (2026-09-17)", point 3 and "Git store
 * specifics"): `'private'` always uses `projectDir` itself (a `.git` created lazily on first
 * commit); `'enclosing'` reuses an enclosing repository found via `isomorphic-git`'s `findRoot`,
 * scoping every operation to the project's own paths, and falls back to private when none is found
 * (never creates a nested repo inside a found enclosing one, and never invents one two levels up).
 */
export const resolveRepoContext = async (projectDir: string, options: IGitVersioningOptions): Promise<IRepoContext> => {
  if (options.repoMode === 'enclosing') {
    try {
      const repoRoot = await git.findRoot({ fs: nodeFs, filepath: projectDir });
      return { repoRoot, projectRelDir: toPosix(path.relative(repoRoot, projectDir)) };
    } catch {
      // No enclosing repository found — fall back to private (see module doc above).
    }
  }
  return { repoRoot: projectDir, projectRelDir: '' };
};

/**
 * `true` iff a git repository has never been initialized at `ctx.repoRoot` yet — the only case
 * `GitVersionStore` calls `git.init` itself (lazily, on the first commit), and therefore the only
 * case it writes `.gitignore`: an `'enclosing'` context that found a real root always already has a
 * `.git`, so this is never true for it (see the ADR's "leave the user's ignore rules alone").
 */
export const needsInit = async (ctx: IRepoContext): Promise<boolean> =>
  !(await pathExists(path.join(ctx.repoRoot, '.git')));

// `.falang-versioning.json` (ADR 0025 (private), "Correction to decision 2
// (2026-09-18)") is session-gap bookkeeping, not project content — never committed, same reasoning
// as `.falang-debug.json`. Only covers newly-`init`ed repos (see `needsInit`'s own doc comment);
// an already-initialized repo from before this line existed isn't retroactively patched.
export const GITIGNORE_CONTENT = ['generated/', '.falang-debug.json', '.falang-versioning.json', 'backup/', ''].join(
  '\n',
);

export const gitignorePath = (ctx: IRepoContext): string => path.join(ctx.repoRoot, '.gitignore');

/** Only a context that owns its repo root (private, or an enclosing fallback) ever wrote `.gitignore` itself. */
export const ownsRepoRoot = (ctx: IRepoContext): boolean => ctx.projectRelDir === '';
