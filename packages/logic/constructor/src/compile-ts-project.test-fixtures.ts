import type { INode, IProjectDocument } from '@falang/dto';
import { EXTERNAL_API_STRUCTURE_NAME, OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import type { IFunctionBodyParameter } from './function-signature.js';

/**
 * Hand-built `function`/`objects-structure`/`external-api-structure` document trees for
 * `compile-ts-project.test.ts` — split into its own file purely to stay under `oxlint`'s `max-lines`
 * (same "split into its own file" precedent as `resolve-expression-number-type.ts`'s own doc comment).
 */
export interface IFunctionNodeParams {
  readonly id: string;
  readonly parameters?: { name: string; type: unknown }[];
  readonly returnValue?: unknown;
  readonly body: INode[];
}

export const functionNode = ({ id, parameters = [], returnValue, body }: IFunctionNodeParams): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters, returnValue }, children: body },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

export const functionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root,
});

export const structDocument = (
  documentId: string,
  documentName: string,
  threads: { threadId: string; name: string; properties: Record<string, unknown> }[],
): IProjectDocument => ({
  id: documentId,
  type: OBJECTS_STRUCTURE_NAME,
  name: documentName,
  root: {
    id: 'root',
    name: OBJECTS_STRUCTURE_NAME,
    children: [
      { id: 'header', name: `${OBJECTS_STRUCTURE_NAME}-header`, data: '' },
      {
        id: 'body',
        name: `${OBJECTS_STRUCTURE_NAME}-body`,
        data: null,
        children: threads.map((thread) => ({
          id: thread.threadId,
          name: `${OBJECTS_STRUCTURE_NAME}-thread`,
          data: thread.name,
          children: Object.entries(thread.properties).map(([propertyName, variableType], index) => ({
            id: `${thread.threadId}-child-${index}`,
            name: `${OBJECTS_STRUCTURE_NAME}-child`,
            data: { name: propertyName, variableType },
          })),
        })),
      },
    ],
  },
});

export const externalApiDocument = (
  documentId: string,
  documentName: string,
  groups: {
    groupId: string;
    name: string;
    endpoints: { id: string; name: string; parameters: readonly IFunctionBodyParameter[]; returnValue?: unknown }[];
  }[],
): IProjectDocument => ({
  id: documentId,
  type: EXTERNAL_API_STRUCTURE_NAME,
  name: documentName,
  root: {
    id: 'root',
    name: EXTERNAL_API_STRUCTURE_NAME,
    children: [
      { id: 'header', name: `${EXTERNAL_API_STRUCTURE_NAME}-header`, data: '' },
      {
        id: 'body',
        name: `${EXTERNAL_API_STRUCTURE_NAME}-body`,
        data: null,
        children: groups.map((group) => ({
          id: group.groupId,
          name: `${EXTERNAL_API_STRUCTURE_NAME}-thread`,
          data: { name: group.name },
          children: group.endpoints.map((endpoint) => ({
            id: endpoint.id,
            name: `${EXTERNAL_API_STRUCTURE_NAME}-child`,
            data: { name: endpoint.name, parameters: endpoint.parameters, returnValue: endpoint.returnValue },
          })),
        })),
      },
    ],
  },
});
