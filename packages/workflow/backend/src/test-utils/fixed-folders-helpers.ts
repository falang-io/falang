import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { auth } from './e2e-app.js';

export interface ITreeFolder {
  id: string;
  name: string;
  parentId: string | null;
  fixedKind: string | null;
}
export interface ITreeDocument {
  id: string;
  type: string;
  name: string;
  folderId: string | null;
  pinned: boolean;
}

export const sectionId = (folders: ITreeFolder[], kind: string): string =>
  folders.find((folder) => folder.fixedKind === kind)?.id as string;

export const statusOf = async (pending: PromiseLike<{ status: number }>): Promise<number> => {
  const response = await pending;
  return response.status;
};

/** Request helpers over a test app; `getToken` is read per call since the token is set in `beforeEach`. */
export const makeFolderTestHelpers = (getApp: () => INestApplication, getToken: () => string) => {
  const http = () => request(getApp().getHttpServer());

  const createProject = async (name = 'p'): Promise<string> => {
    const response = await http().post('/projects').set(auth(getToken())).send({ name });
    return response.body.id as string;
  };

  const getTree = async (projectId: string): Promise<{ folders: ITreeFolder[]; documents: ITreeDocument[] }> => {
    const response = await http().get(`/projects/${projectId}/tree`).set(auth(getToken()));
    return response.body;
  };

  const createDoc = (projectId: string, type: string, name: string, ...folder: [] | [string | null]) => {
    const id = randomUUID();
    const body: Record<string, unknown> = { id, type, name, root: { id, name: type, children: [] } };
    if (folder.length > 0) body.folderId = folder[0];
    return http().post(`/projects/${projectId}/documents`).set(auth(getToken())).send(body);
  };

  const createFolder = (projectId: string, name: string, ...parent: [] | [string | null]) => {
    const body: Record<string, unknown> = { id: randomUUID(), name };
    if (parent.length > 0) body.parentId = parent[0];
    return http().post(`/projects/${projectId}/folders`).set(auth(getToken())).send(body);
  };

  return { http, createProject, getTree, createDoc, createFolder };
};
