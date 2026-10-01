import * as nodeFs from 'node:fs';
import git from 'isomorphic-git';
import type { IProjectDocument, IProjectTreeDocument, IProjectTreeFolder } from '@falang/dto';
import type { IProjectSnapshot, ISnapshotDocument } from '@falang/versioning';
import { readDocumentFile } from '../documents.js';
import { readManifest } from '../manifest.js';
import { withProjectLock } from '../project-lock.js';
import { documentRelPosix } from '../layout.js';
import { MANIFEST_FILENAME } from '../paths.js';
import type { IManifestDocument, IManifestFolder } from '../types.js';
import { joinGitPath, type IRepoContext } from './git-paths.js';

interface IBlobManifest {
  folders: IManifestFolder[];
  documents: IManifestDocument[];
}

/** Snapshots are content-only: a folder's on-disk `dirName` is layout, not content, so a pure rename-on-disk is never a diff. */
const toSnapshotFolders = (folders: readonly IManifestFolder[]): IProjectTreeFolder[] =>
  folders.map((folder) => ({ id: folder.id, name: folder.name, parentId: folder.parentId }));

const toSnapshotDocument = (entry: IProjectTreeDocument, document: IProjectDocument): ISnapshotDocument => ({
  id: entry.id,
  type: entry.type,
  name: entry.name,
  folderId: entry.folderId,
  pinned: entry.pinned ?? false,
  ...('root' in document ? { root: document.root } : {}),
  ...('data' in document ? { data: document.data } : {}),
});

/** Reads the live, on-disk working copy — manifest tree entries plus each document's own payload file. */
export const readWorkingCopySnapshot = (projectDir: string): Promise<IProjectSnapshot> =>
  withProjectLock(projectDir, async () => {
    const manifest = await readManifest(projectDir);
    const documents = await Promise.all(
      manifest.documents.map(async (entry) =>
        toSnapshotDocument(entry, await readDocumentFile(projectDir, manifest, entry)),
      ),
    );
    return { folders: toSnapshotFolders(manifest.folders), documents };
  });

const readJsonBlob = async (ctx: IRepoContext, oid: string, relPath: string): Promise<unknown> => {
  const { blob } = await git.readBlob({
    fs: nodeFs,
    dir: ctx.repoRoot,
    oid,
    filepath: joinGitPath(ctx.projectRelDir, relPath),
  });
  return JSON.parse(Buffer.from(blob).toString('utf8'));
};

/** Reads a whole-project snapshot straight from git blobs at `oid` — no working-tree checkout needed. */
export const readSnapshotAtOid = async (ctx: IRepoContext, oid: string): Promise<IProjectSnapshot> => {
  // oxlint-disable-next-line init-declarations
  let manifest: IBlobManifest;
  try {
    manifest = (await readJsonBlob(ctx, oid, MANIFEST_FILENAME)) as IBlobManifest;
  } catch (error) {
    throw new Error(
      `Unknown commit "${oid}" (its ${MANIFEST_FILENAME} could not be read): ${(error as Error).message}`,
      {
        cause: error,
      },
    );
  }
  const documents = await Promise.all(
    manifest.documents.map(async (entry) => {
      const document = (await readJsonBlob(ctx, oid, documentRelPosix(manifest, entry))) as IProjectDocument;
      return toSnapshotDocument(entry, document);
    }),
  );
  return { folders: toSnapshotFolders(manifest.folders), documents };
};
