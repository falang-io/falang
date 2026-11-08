import type { INode, IProjectTreeFolder } from '@falang/dto';
import {
  CONSTANTS_DOCUMENT_NAME,
  CONSTANTS_DOCUMENT_TYPE,
  emptyConstantsData,
  normalizeWorkflowProjectLayout,
} from '@falang/workflow-dto';
import { INTEGRATIONS_DOCUMENT_TYPE } from '@falang/workflow-integrations-common';
import type { IApiProjectExport } from '../api-types.js';

/** One document of a project a guest edits in the browser — the export format's document, always with `root`/`data`. */
export interface IGuestDocument {
  id: string;
  type: string;
  name: string;
  folderId: string | null;
  pinned: boolean;
  root: INode | null;
  data: unknown;
}

/** A whole project kept in the browser: what a template opens as for a visitor without an account. */
export interface IGuestProjectState {
  folders: IProjectTreeFolder[];
  documents: IGuestDocument[];
}

/** The pinned documents every real project gets on creation (`ProjectsService.create`). */
const INTEGRATIONS_DOCUMENT_NAME = 'Integrations';

/**
 * Turns a template's payload into the project a signed-in user would get from it: the fixed section folders
 * (ADR 0055 (private)) with every document in its section, and exactly one pinned `integrations` and one pinned
 * `constants` document — a payload uploaded by script may lack them. Pure; ids of the payload are kept, new folders get `createId()`.
 */
export const buildGuestProjectState = (payload: IApiProjectExport, createId: () => string): IGuestProjectState => {
  const integrations = payload.documents.find((document) => document.type === INTEGRATIONS_DOCUMENT_TYPE);
  const constants = payload.documents.find((document) => document.type === CONSTANTS_DOCUMENT_TYPE);
  // Other pinned singletons are dropped, as an import drops them.
  const regular = payload.documents.filter(
    (document) =>
      document.type !== INTEGRATIONS_DOCUMENT_TYPE && document.type !== CONSTANTS_DOCUMENT_TYPE && !document.pinned,
  );
  const normalized = normalizeWorkflowProjectLayout(
    payload.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
      fixedKind: folder.fixedKind ?? null,
    })),
    regular.map((document) => ({
      id: document.id,
      type: document.type,
      folderId: document.folderId ?? null,
      pinned: false,
      source: document,
    })),
    { createId },
  );
  const documents: IGuestDocument[] = [
    {
      id: integrations?.id ?? createId(),
      type: INTEGRATIONS_DOCUMENT_TYPE,
      name: integrations?.name ?? INTEGRATIONS_DOCUMENT_NAME,
      folderId: null,
      pinned: true,
      root: null,
      data: integrations?.data ?? { instances: [] },
    },
    {
      id: constants?.id ?? createId(),
      type: CONSTANTS_DOCUMENT_TYPE,
      name: CONSTANTS_DOCUMENT_NAME,
      folderId: null,
      pinned: true,
      root: null,
      data: constants?.data ?? emptyConstantsData(),
    },
    ...normalized.documents.map(({ source, folderId }) => ({
      id: source.id,
      type: source.type,
      name: source.name,
      folderId,
      pinned: false,
      root: source.root ?? null,
      data: source.data ?? null,
    })),
  ];
  return { folders: structuredClone(normalized.folders), documents };
};

/** The guest's project in the export format, for `POST /projects/import` once they have an account. */
export const guestProjectToExport = (state: IGuestProjectState, name: string): IApiProjectExport => ({
  formatVersion: 1,
  project: { id: '', name },
  folders: state.folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    fixedKind: folder.fixedKind ?? null,
  })),
  documents: state.documents.map((document) => ({
    id: document.id,
    type: document.type,
    name: document.name,
    folderId: document.folderId,
    pinned: document.pinned,
    root: document.root,
    data: document.data,
  })),
});
