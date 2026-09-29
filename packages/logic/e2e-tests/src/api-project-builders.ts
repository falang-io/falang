import type { INode, IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { EXTERNAL_API_STRUCTURE_NAME, OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';

/** Node-builder helpers for `api-project.fixture.ts` — split into a sibling file purely to stay under `oxlint`'s `max-lines`, same reasoning `arrays-project-builders.ts` already established. */

export interface IPropertyDef {
  readonly name: string;
  readonly variableType: TVariableInfo;
}

const structureChild = (id: string, property: IPropertyDef): INode => ({
  id,
  name: `${OBJECTS_STRUCTURE_NAME}-child`,
  data: property,
});

export const structureThread = (id: string, name: string, properties: readonly IPropertyDef[]): INode => ({
  id,
  name: `${OBJECTS_STRUCTURE_NAME}-thread`,
  data: name,
  children: properties.map((property, index) => structureChild(`${id}-prop-${index}`, property)),
});

export const objectsStructureDocument = (
  documentId: string,
  name: string,
  threads: readonly INode[],
): IProjectDocument => ({
  id: documentId,
  type: OBJECTS_STRUCTURE_NAME,
  name,
  root: {
    id: `${documentId}-root`,
    name: OBJECTS_STRUCTURE_NAME,
    children: [
      { id: `${documentId}-header`, name: `${OBJECTS_STRUCTURE_NAME}-header`, data: '' },
      { id: `${documentId}-body`, name: `${OBJECTS_STRUCTURE_NAME}-body`, data: null, children: threads },
    ],
  },
});

export interface IEndpointDef {
  readonly id: string;
  readonly name: string;
  readonly parameters: readonly IFunctionParameter[];
  readonly returnValue?: TVariableInfo;
}

const apiEndpoint = (endpoint: IEndpointDef): INode => ({
  id: endpoint.id,
  name: `${EXTERNAL_API_STRUCTURE_NAME}-child`,
  data: { name: endpoint.name, parameters: endpoint.parameters, returnValue: endpoint.returnValue },
});

export const apiThread = (id: string, name: string, endpoints: readonly IEndpointDef[]): INode => ({
  id,
  name: `${EXTERNAL_API_STRUCTURE_NAME}-thread`,
  data: { name },
  children: endpoints.map((endpoint) => apiEndpoint(endpoint)),
});

export const externalApiStructureDocument = (
  documentId: string,
  name: string,
  threads: readonly INode[],
): IProjectDocument => ({
  id: documentId,
  type: EXTERNAL_API_STRUCTURE_NAME,
  name,
  root: {
    id: `${documentId}-root`,
    name: EXTERNAL_API_STRUCTURE_NAME,
    children: [
      { id: `${documentId}-header`, name: `${EXTERNAL_API_STRUCTURE_NAME}-header`, data: '' },
      { id: `${documentId}-body`, name: `${EXTERNAL_API_STRUCTURE_NAME}-body`, data: null, children: threads },
    ],
  },
});

export interface IFunctionParameter {
  readonly name: string;
  readonly type: TVariableInfo;
}

export interface IFunctionDocumentParams {
  readonly documentId: string;
  readonly name: string;
  readonly parameters?: readonly IFunctionParameter[];
  readonly returnValue?: TVariableInfo;
  readonly body: readonly INode[];
}

export const functionDocument = ({
  documentId,
  name,
  parameters = [],
  returnValue,
  body,
}: IFunctionDocumentParams): IProjectDocument => ({
  id: documentId,
  type: 'function',
  name,
  root: {
    id: `${documentId}-root`,
    name: 'function',
    children: [
      { id: `${documentId}-header`, name: 'function-header', data: '' },
      { id: `${documentId}-body`, name: 'function-body', data: { parameters, returnValue }, children: body },
      { id: `${documentId}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

export const createVar = (id: string, name: string, variableType: TVariableInfo, value?: string): INode => ({
  id,
  name: 'create-var',
  data: { name, variableType, value },
});

export const action = (id: string, statement: string): INode => ({ id, name: 'action', data: statement });

export const log = (id: string, message: string): INode => ({ id, name: 'log', data: message });

export const callFunction = (
  id: string,
  schemeId: string,
  parameters: readonly string[],
  returnVariable: string,
): INode => ({ id, name: 'call-function', data: { schemeId, parameters, returnVariable } });

export const callApi = (
  id: string,
  schemeId: string,
  iconId: string,
  parameters: readonly string[],
  returnVariable: string,
): INode => ({
  id,
  name: 'call-api',
  data: { schemeId, iconId, parameters, returnVariable },
});
