import { promises as fs } from 'node:fs';
import * as nodeFs from 'node:fs';
import * as path from 'node:path';
import git from 'isomorphic-git';
import { readManifest } from '../manifest.js';
import { withProjectLock } from '../project-lock.js';
import { documentRelPosix } from '../layout.js';
import { CONFIG_DIRNAME, FALANG_DIRNAME, MANIFEST_FILENAME, configDir } from '../paths.js';
import { gitignorePath, joinGitPath, ownsRepoRoot, pathExists, type IRepoContext } from './git-paths.js';

/**
 * Stages the project's current on-disk state onto the git index: `add`s `falang.json`, every
 * document file the manifest currently lists (at its name-based path under `falang/schemes/`), and every file currently
 * sitting under `falang/config/` (cheap to enumerate generically via `readdir` — `project-fs` never
 * needs to know a domain's own config filenames, e.g. `@falang/logic-export`'s `logic-export.json`
 * — see ADR 0005 (private)'s "Implementation notes (on-disk layout v4
 * …)"), plus `.gitignore` if this context owns its repo root. Then, scoped to the project's own
 * paths, `remove`s any file the index/HEAD still tracks but that no longer exists on disk (a
 * document deleted since the last commit) — found via `statusMatrix` rather than assumed, since a
 * `moveDocument`/rename doesn't delete anything.
 */
const stageWorkingCopyUnlocked = async (projectDir: string, ctx: IRepoContext): Promise<void> => {
  const manifest = await readManifest(projectDir);
  const configEntries = await fs.readdir(configDir(projectDir)).catch(() => [] as string[]);
  const addPaths = [
    joinGitPath(ctx.projectRelDir, MANIFEST_FILENAME),
    ...manifest.documents.map((doc) => joinGitPath(ctx.projectRelDir, documentRelPosix(manifest, doc))),
    ...configEntries.map((fileName) =>
      joinGitPath(ctx.projectRelDir, path.posix.join(FALANG_DIRNAME, CONFIG_DIRNAME, fileName)),
    ),
  ];
  if (ownsRepoRoot(ctx) && (await pathExists(gitignorePath(ctx)))) {
    addPaths.push('.gitignore');
  }
  await git.add({ fs: nodeFs, dir: ctx.repoRoot, filepath: addPaths });

  const scope = ctx.projectRelDir === '' ? '.' : ctx.projectRelDir;
  const rows = await git.statusMatrix({ fs: nodeFs, dir: ctx.repoRoot, filepaths: [scope] });
  for (const [filepath, headStatus, workdirStatus] of rows) {
    if (workdirStatus === 0 && headStatus !== 0) {
      // oxlint-disable-next-line no-await-in-loop -- sequential index mutations against one small repo, order doesn't matter but concurrency isn't worth the complexity here
      await git.remove({ fs: nodeFs, dir: ctx.repoRoot, filepath });
    }
  }
};

export const stageWorkingCopy = (projectDir: string, ctx: IRepoContext): Promise<void> =>
  withProjectLock(projectDir, () => stageWorkingCopyUnlocked(projectDir, ctx));
