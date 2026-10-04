import * as nodeFs from 'node:fs';
import git from 'isomorphic-git';
import { CONFIG_DIRNAME, DRIVERS_DIRNAME, FALANG_DIRNAME } from '../paths.js';
import { joinGitPath, pathExists, type IRepoContext } from './git-paths.js';

/** Whether any of the given repo-relative directories currently holds an entry (nothing to compare against yet). */
export const anyFilesIn = async (ctx: IRepoContext, relDirs: readonly string[]): Promise<boolean> => {
  const found = await Promise.all(
    relDirs.map(async (rel) => {
      const dir = `${ctx.repoRoot}/${rel}`;
      if (!(await pathExists(dir))) return false;
      const entries = await nodeFs.promises.readdir(dir);
      return entries.length > 0;
    }),
  );
  return found.some(Boolean);
};

/**
 * Whether files the document snapshot doesn't cover — everything `stageWorkingCopy` adds under
 * `falang/config/` and `falang/drivers/` (custom Arduino drivers, ADR 0054 (private)) — differ from
 * HEAD: created, modified or deleted. Uses the same two directories `git-stage.ts` stages, via
 * `statusMatrix` scoped to them (a row other than `[1, 1, 1]` is a change). A repo that doesn't
 * exist yet has nothing to compare with, so any file there counts as a change.
 */
export const hasExtraFileChanges = async (ctx: IRepoContext): Promise<boolean> => {
  const filepaths = [CONFIG_DIRNAME, DRIVERS_DIRNAME].map((dirName) =>
    joinGitPath(ctx.projectRelDir, `${FALANG_DIRNAME}/${dirName}`),
  );
  if (!(await pathExists(`${ctx.repoRoot}/.git`))) return anyFilesIn(ctx, filepaths);
  const rows = await git
    .statusMatrix({ fs: nodeFs, dir: ctx.repoRoot, filepaths })
    // An unborn HEAD makes some isomorphic-git versions throw; every file is then new.
    .catch(() => null);
  if (rows === null) return anyFilesIn(ctx, filepaths);
  return rows.some(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1));
};
