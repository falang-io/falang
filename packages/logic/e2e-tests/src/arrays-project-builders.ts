import type { INode, IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';

/** Small hand-built `INode`/`IProjectDocument` helpers shared by `arrays-project.fixture.ts` — split out purely to keep that file under `oxlint`'s `max-lines`, same reasoning `@falang/logic-constructor`'s own multi-file split documents in ADR 0019 (private). */

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

interface IFunctionParameter {
  readonly name: string;
  readonly type: TVariableInfo;
}

interface IFunctionDocumentParams {
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

/** Omitting `value` (the empty-string default) makes `emitCreateVar` value-initialize instead — see `arrays-project.fixture.ts`'s top comment on gap 1 (array literals). */
export const createVar = (id: string, name: string, variableType: TVariableInfo, value = ''): INode => ({
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
  returnVariable = '',
): INode => ({
  id,
  name: 'call-function',
  data: { schemeId, parameters, returnVariable },
});

export const foreach = (id: string, arr: string, item: string, children: readonly INode[]): INode => ({
  id,
  name: 'foreach',
  data: { arr, item, index: '' },
  children,
});

/** `to` is already translated to the inclusive bound — see `arrays-project.fixture.ts`'s top comment. */
export const fromToCycle = (id: string, from: string, to: string, item: string, children: readonly INode[]): INode => ({
  id,
  name: 'from-to-cycle',
  data: { from, to, item },
  children,
});

export const arrPush = (id: string, arr: string, value: string): INode => ({
  id,
  name: 'arr-push',
  data: { arr, value },
});
export const arrPop = (id: string, arr: string, variable: string): INode => ({
  id,
  name: 'arr-pop',
  data: { arr, variable },
});
export const arrShift = (id: string, arr: string, variable: string): INode => ({
  id,
  name: 'arr-shift',
  data: { arr, variable },
});
export const arrUnshift = (id: string, arr: string, value: string): INode => ({
  id,
  name: 'arr-unshift',
  data: { arr, value },
});
