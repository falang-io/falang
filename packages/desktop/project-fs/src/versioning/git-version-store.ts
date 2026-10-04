import { promises as fs } from 'node:fs';
import * as nodeFs from 'node:fs';
import * as path from 'node:path';
import git from 'isomorphic-git';
import { diffSnapshots, isSnapshotDirty } from '@falang/versioning';
import type { ICommitInfo, IProjectSnapshot, IVersionStore, TCommitKind } from '@falang/versioning';
import { documentFilePath } from '../layout.js';
import { readManifest } from '../manifest.js';
import { withProjectLock } from '../project-lock.js';
import { DRIVERS_DIRNAME, FALANG_DIRNAME, documentsDir, driversDir } from '../paths.js';
import { reconcileProjectLayout } from '../reconcile-layout.js';
import {
  assertCommitExists,
  buildCommitInfo,
  readNamedTags,
  resolveHeadOid,
  setNamedTag,
  shortOid,
  toCommitInfo,
} from './git-commit-info.js';
import {
  GITIGNORE_CONTENT,
  gitignorePath,
  joinGitPath,
  needsInit,
  pathExists,
  resolveRepoContext,
  type IRepoContext,
} from './git-paths.js';
import { hasExtraFileChanges } from './git-extra-changes.js';
import { readSnapshotAtOid, readWorkingCopySnapshot } from './git-snapshot-io.js';
import { stageWorkingCopy } from './git-stage.js';
import { createSerialQueue } from './serial-queue.js';
import type { IGitVersioningOptions } from './git-version-store-types.js';

export { DEFAULT_AUTO_VERSION_GAP_HOURS, DEFAULT_GIT_VERSIONING_OPTIONS } from './git-version-store-types.js';
export type { IGitVersioningOptions } from './git-version-store-types.js';

/** Deletes every `.json` under `falang/schemes/` (any depth) that the restored manifest doesn't reference by its resolved path. */
const deleteExtraDocumentFiles = async (projectDir: string): Promise<void> => {
  const manifest = await readManifest(projectDir);
  const referenced = new Set(manifest.documents.map((doc) => documentFilePath(projectDir, manifest, doc)));
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile() && entry.name.endsWith('.json') && !referenced.has(full))
          await fs.rm(full, { force: true });
      }),
    );
  };
  await walk(documentsDir(projectDir));
};

/** Removes every file under `falang/drivers/` that the restored commit doesn't contain (a driver deleted since), then prunes emptied directories. */
const deleteExtraDriverFiles = async (projectDir: string, ctx: IRepoContext, commitId: string): Promise<void> => {
  const prefix = joinGitPath(ctx.projectRelDir, `${FALANG_DIRNAME}/${DRIVERS_DIRNAME}/`);
  const committed = await git.listFiles({ fs: nodeFs, dir: ctx.repoRoot, ref: commitId });
  const tracked = new Set(committed.filter((file) => file.startsWith(prefix)));
  const root = driversDir(projectDir);
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          // `rmdir` only succeeds on an empty directory — exactly what a fully-pruned driver folder is.
          await fs.rmdir(full).catch(() => null);
        } else if (entry.isFile()) {
          const rel = path.relative(ctx.repoRoot, full).split(path.sep).join('/');
          if (!tracked.has(rel)) await fs.rm(full, { force: true });
        }
      }),
    );
  };
  await walk(root);
};

class GitVersionStore implements IVersionStore {
  private readonly enqueue = createSerialQueue();
  private readonly projectDir: string;
  private readonly getOptions: () => Promise<IGitVersioningOptions> | IGitVersioningOptions;

  constructor(projectDir: string, getOptions: () => Promise<IGitVersioningOptions> | IGitVersioningOptions) {
    this.projectDir = projectDir;
    this.getOptions = getOptions;
  }

  listCommits(): Promise<ICommitInfo[]> {
    return this.enqueue(async () => {
      const ctx = await this.resolveContext();
      if (!(await pathExists(path.join(ctx.repoRoot, '.git')))) return [];

      const entries = await git
        .log({
          fs: nodeFs,
          dir: ctx.repoRoot,
          ...(ctx.projectRelDir === '' ? {} : { filepath: ctx.projectRelDir }),
        })
        // An unborn HEAD (repo initialized, no commits yet) throws — `listCommits()` on it is `[]`.
        .catch(() => []);
      if (entries.length === 0) return [];

      const tags = await readNamedTags(ctx.repoRoot);
      return entries.map(({ oid, commit }) => toCommitInfo(oid, commit, tags));
    });
  }

  getSnapshot(commitId: string): Promise<IProjectSnapshot> {
    return this.enqueue(async () => {
      const ctx = await this.resolveContext();
      return readSnapshotAtOid(ctx, commitId);
    });
  }

  getWorkingCopy(): Promise<IProjectSnapshot> {
    return this.enqueue(() => readWorkingCopySnapshot(this.projectDir));
  }

  hasExtraChanges(): Promise<boolean> {
    return this.enqueue(async () => hasExtraFileChanges(await this.resolveContext()));
  }

  commit(params: { kind: TCommitKind; message: string }): Promise<ICommitInfo | null> {
    return this.enqueue(async () => {
      const options = await this.getOptions();
      const ctx = await this.resolveContext(options);
      return this.commitCore(ctx, options, params.kind, params.message);
    });
  }

  nameCommit(commitId: string, message: string): Promise<ICommitInfo> {
    return this.enqueue(async () => {
      const options = await this.getOptions();
      const ctx = await this.resolveContext(options);
      await assertCommitExists(ctx.repoRoot, commitId);
      await setNamedTag(ctx.repoRoot, commitId, message, options);
      return buildCommitInfo(ctx.repoRoot, commitId);
    });
  }

  restore(commitId: string): Promise<ICommitInfo> {
    return this.enqueue(async () => {
      const options = await this.getOptions();
      const ctx = await this.resolveContext(options);
      const targetCommit = await assertCommitExists(ctx.repoRoot, commitId);
      // Fail early (before touching the working tree) if the commit's snapshot can't be read at all.
      await readSnapshotAtOid(ctx, commitId);

      await git.checkout({
        fs: nodeFs,
        dir: ctx.repoRoot,
        ref: commitId,
        filepaths: [ctx.projectRelDir === '' ? '.' : ctx.projectRelDir],
        force: true,
        noUpdateHead: true,
      });

      // `git.checkout` was observed to remove tracked files outside the target tree on its own
      // (see the ADR's "Implementation notes" for the real, live-verified behavior) — this is a
      // defensive extra pass so restore's correctness never depends on that observation holding
      // across an isomorphic-git version bump.
      await withProjectLock(this.projectDir, () => deleteExtraDocumentFiles(this.projectDir));
      await withProjectLock(this.projectDir, () => deleteExtraDriverFiles(this.projectDir, ctx, commitId));
      // A v4-era commit restores its flat `<id>.json` layout — bring it to v5 (name-based paths) again.
      await reconcileProjectLayout(this.projectDir);

      const message = `Restore ${shortOid(commitId)}: ${targetCommit.message}`;
      const result = await this.commitCore(ctx, options, 'named', message);
      if (result !== null) return result;

      const headOid = await resolveHeadOid(ctx.repoRoot);
      if (headOid === null) {
        throw new Error('Restore produced no new commit and HEAD is unexpectedly empty');
      }
      return buildCommitInfo(ctx.repoRoot, headOid);
    });
  }

  private async resolveContext(options?: IGitVersioningOptions): Promise<IRepoContext> {
    return resolveRepoContext(this.projectDir, options ?? (await this.getOptions()));
  }

  private async commitCore(
    ctx: IRepoContext,
    options: IGitVersioningOptions,
    kind: TCommitKind,
    message: string,
  ): Promise<ICommitInfo | null> {
    const workingCopy = await readWorkingCopySnapshot(this.projectDir);
    const headOid = await resolveHeadOid(ctx.repoRoot);
    // `null` here also covers an `'enclosing'` repo whose HEAD predates this project's own
    // path existing at all (e.g. the outer repo's history before this project was added to it) —
    // not a real error, just "no prior snapshot of this project yet".
    const headSnapshot = headOid === null ? null : await readSnapshotAtOid(ctx, headOid).catch(() => null);
    const documentsDirty =
      headSnapshot === null ? isSnapshotDirty(null, workingCopy) : !diffSnapshots(headSnapshot, workingCopy).isEmpty;
    // Files outside the document snapshot (`falang/config/**`, `falang/drivers/**`) are staged too, so a change
    // to only those must still make a commit.
    if (!documentsDirty && !(await hasExtraFileChanges(ctx))) return null;

    if (await needsInit(ctx)) {
      await git.init({ fs: nodeFs, dir: ctx.repoRoot, defaultBranch: 'main' });
      await fs.writeFile(gitignorePath(ctx), GITIGNORE_CONTENT);
    }

    await stageWorkingCopy(this.projectDir, ctx);

    const oid = await git.commit({
      fs: nodeFs,
      dir: ctx.repoRoot,
      message,
      author: { name: options.author.name, email: options.author.email },
    });

    if (kind === 'named') {
      await setNamedTag(ctx.repoRoot, oid, message, options);
    }

    return buildCommitInfo(ctx.repoRoot, oid);
  }
}

/**
 * `GitVersionStore` for a desktop project directory, per ADR 0025 (private) —
 * `IVersionStore` over [isomorphic-git](https://isomorphic-git.org/), pure JS, no `git` binary
 * required. `getOptions` is read fresh on every operation (a "Settings → Versioning…" change takes
 * effect on the next call, not just on app restart). All operations on one `projectDir` run through
 * a per-store serial queue — see `serial-queue.ts`.
 */
export const createGitVersionStore = (
  projectDir: string,
  getOptions: () => Promise<IGitVersioningOptions> | IGitVersioningOptions,
): IVersionStore => new GitVersionStore(projectDir, getOptions);
