import { promises as fs } from 'node:fs';
import * as nodeFs from 'node:fs';
import * as path from 'node:path';
import git from 'isomorphic-git';
import { diffSnapshots, isSnapshotDirty } from '@falang/versioning';
import type { ICommitInfo, IProjectSnapshot, IVersionStore, TCommitKind } from '@falang/versioning';
import { documentsDir } from '../paths.js';
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
  needsInit,
  pathExists,
  resolveRepoContext,
  type IRepoContext,
} from './git-paths.js';
import { readSnapshotAtOid, readWorkingCopySnapshot } from './git-snapshot-io.js';
import { stageWorkingCopy } from './git-stage.js';
import { createSerialQueue } from './serial-queue.js';
import type { IGitVersioningOptions } from './git-version-store-types.js';

export { DEFAULT_AUTO_VERSION_GAP_HOURS, DEFAULT_GIT_VERSIONING_OPTIONS } from './git-version-store-types.js';
export type { IGitVersioningOptions } from './git-version-store-types.js';

const deleteExtraDocumentFiles = async (projectDir: string, targetSnapshot: IProjectSnapshot): Promise<void> => {
  const targetIds = new Set(targetSnapshot.documents.map((doc) => doc.id));
  const docsDir = documentsDir(projectDir);
  const entries = await fs.readdir(docsDir).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((fileName) => fileName.endsWith('.json') && !targetIds.has(fileName.slice(0, -'.json'.length)))
      .map((fileName) => fs.rm(path.join(docsDir, fileName), { force: true })),
  );
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
      const targetSnapshot = await readSnapshotAtOid(ctx, commitId);

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
      await deleteExtraDocumentFiles(this.projectDir, targetSnapshot);

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
    const dirty =
      headSnapshot === null ? isSnapshotDirty(null, workingCopy) : !diffSnapshots(headSnapshot, workingCopy).isEmpty;
    if (!dirty) return null;

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
