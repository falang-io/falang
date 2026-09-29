import * as nodeFs from 'node:fs';
import git, { type CommitObject } from 'isomorphic-git';
import type { ICommitInfo } from '@falang/versioning';
import type { IGitVersioningOptions } from './git-version-store-types.js';

/** `named` commits carry an annotated tag `falang/<short-oid>` whose message is the given name. */
export const NAMED_TAG_PREFIX = 'falang/';

export const shortOid = (oid: string): string => oid.slice(0, 7);

const firstLine = (message: string): string => message.split('\n')[0];

/** `HEAD`'s current oid, or `null` on an unborn/uninitialized repo (no commits yet). */
export const resolveHeadOid = async (repoRoot: string): Promise<string | null> => {
  try {
    return await git.resolveRef({ fs: nodeFs, dir: repoRoot, ref: 'HEAD' });
  } catch {
    return null;
  }
};

/** Every `falang/<short-oid>` tag's name → its (trimmed) message, read once per call site. */
export const readNamedTags = async (repoRoot: string): Promise<Map<string, string>> => {
  const tagNames = await git.listTags({ fs: nodeFs, dir: repoRoot });
  const entries = await Promise.all(
    tagNames
      .filter((name) => name.startsWith(NAMED_TAG_PREFIX))
      .map(async (name) => {
        const tagOid = await git.resolveRef({ fs: nodeFs, dir: repoRoot, ref: `refs/tags/${name}` });
        const { tag } = await git.readTag({ fs: nodeFs, dir: repoRoot, oid: tagOid });
        return [name, tag.message.trimEnd()] as const;
      }),
  );
  return new Map(entries);
};

export const toCommitInfo = (oid: string, commit: CommitObject, tags: Map<string, string>): ICommitInfo => {
  const tagKey = NAMED_TAG_PREFIX + shortOid(oid);
  const isNamed = tags.has(tagKey);
  return {
    id: oid,
    parentId: commit.parent[0] ?? null,
    kind: isNamed ? 'named' : 'auto',
    message: isNamed ? (tags.get(tagKey) as string) : firstLine(commit.message),
    author: `${commit.author.name} <${commit.author.email}>`,
    createdAt: new Date(commit.author.timestamp * 1000).toISOString(),
  };
};

export const buildCommitInfo = async (repoRoot: string, oid: string): Promise<ICommitInfo> => {
  const { commit } = await git.readCommit({ fs: nodeFs, dir: repoRoot, oid });
  const tags = await readNamedTags(repoRoot);
  return toCommitInfo(oid, commit, tags);
};

/** Throws a descriptive error for an oid that doesn't resolve to a commit in this repo. */
export const assertCommitExists = async (repoRoot: string, commitId: string): Promise<ICommitInfo> => {
  try {
    return await buildCommitInfo(repoRoot, commitId);
  } catch (error) {
    throw new Error(`Unknown commit "${commitId}": ${(error as Error).message}`, { cause: error });
  }
};

export const setNamedTag = async (
  repoRoot: string,
  oid: string,
  message: string,
  options: IGitVersioningOptions,
): Promise<void> => {
  await git.annotatedTag({
    fs: nodeFs,
    dir: repoRoot,
    ref: NAMED_TAG_PREFIX + shortOid(oid),
    object: oid,
    message,
    tagger: { name: options.author.name, email: options.author.email },
    force: true,
  });
};
