import * as nodeFs from 'node:fs';
import git from 'isomorphic-git';
import type { IProjectDocument, IProjectTreeDocument, IProjectTreeFolder } from '@falang/dto';
import type { IProjectSnapshot, ISnapshotDocument } from '@falang/versioning';
import { readDocument } from '../documents.js';
import { readManifest } from '../manifest.js';
import { FALANG_DIRNAME, MANIFEST_FILENAME, SCHEMES_DIRNAME } from '../paths.js';
import { joinGitPath, type IRepoContext } from './git-paths.js';

/** POSIX-relative path (within the project dir) of a document's payload file under the v4 layout — `falang/schemes/<id>.json`. */
const documentRelPath = (documentId: string): string => `${FALANG_DIRNAME}/${SCHEMES_DIRNAME}/${documentId}.json`;

interface IBlobManifest {
  folders: IProjectTreeFolder[];
  documents: IProjectTreeDocument[];
}

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
export const readWorkingCopySnapshot = async (projectDir: string): Promise<IProjectSnapshot> => {
  const manifest = await readManifest(projectDir);
  const documents = await Promise.all(
    manifest.documents.map(async (entry) => toSnapshotDocument(entry, await readDocument(projectDir, entry.id))),
  );
  return { folders: manifest.folders, documents };
};

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
      const document = (await readJsonBlob(ctx, oid, documentRelPath(entry.id))) as IProjectDocument;
      return toSnapshotDocument(entry, document);
    }),
  );
  return { folders: manifest.folders, documents };
};
