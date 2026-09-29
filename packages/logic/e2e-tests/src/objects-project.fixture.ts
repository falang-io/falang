import type { INode, IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';

/**
 * New-format rewrite of `old/resources/test-projects/objects` (the ADR 0019-chosen pilot project for
 * the C++ compile-and-run migration) — 9 documents, expected stdout in `objects-project.result.ts`.
 * Per ADR 0019 (private)'s "Compile-and-run test migration" section, old fixtures are rewritten
 * against the current `@falang/dto` node model rather than converted automatically (the old
 * `*.falang.json` format is a different, incompatible `@falang/editor-scheme`-era shape). Two
 * differences from the old fixture, both deliberate:
 * - `ObjB`/`ObjD`/`ObjE` (defined in the old project but never actually instantiated by any
 *   function there) are dropped — only `ObjA`/`ObjC`, the structs the program logic actually uses,
 *   are ported. Nothing exercises the unused ones, so they'd only be extra compile surface.
 * - `main`'s old fixture logged a `"!!test started"` marker line before its 4 `call-function`s —
 *   that marker existed only so the *old* host-process test runner (`old/.../runners.ts`'s
 *   `runScript`) could slice off shell/build-tool banner noise preceding the program's own output.
 *   `runCppProjectInDocker` has no such noise to slice (the Docker harness redirects the `cmake`
 *   build steps' own stdout to `/dev/null`, see `run-cpp-project.ts`), so the marker is dropped and
 *   expected stdout is exactly `result.txt`'s original 4 lines, unchanged.
 */

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const float32Type: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float32' } };

const OBJ_A_THREAD_ID = 'thread-obj-a';
const OBJ_C_THREAD_ID = 'thread-obj-c';

const objAType: TVariableInfo = { type: 'struct', id: OBJ_A_THREAD_ID };
const objCType: TVariableInfo = { type: 'struct', id: OBJ_C_THREAD_ID };

interface IPropertyDef {
  readonly name: string;
  readonly variableType: TVariableInfo;
}

const structureChild = (id: string, property: IPropertyDef): INode => ({
  id,
  name: `${OBJECTS_STRUCTURE_NAME}-child`,
  data: property,
});

const structureThread = (id: string, name: string, properties: readonly IPropertyDef[]): INode => ({
  id,
  name: `${OBJECTS_STRUCTURE_NAME}-thread`,
  data: name,
  children: properties.map((property, index) => structureChild(`${id}-prop-${index}`, property)),
});

const objectsStructureDocument = (documentId: string, name: string, threads: readonly INode[]): IProjectDocument => ({
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

const functionDocument = ({
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

const createVar = (id: string, name: string, variableType: TVariableInfo): INode => ({
  id,
  name: 'create-var',
  data: { name, variableType },
});

const action = (id: string, statement: string): INode => ({ id, name: 'action', data: statement });

const log = (id: string, message: string): INode => ({ id, name: 'log', data: message });

const callFunction = (id: string, schemeId: string, parameters: readonly string[], returnVariable: string): INode => ({
  id,
  name: 'call-function',
  data: { schemeId, parameters, returnVariable },
});

const returnStatement = (id: string, expression: string): INode => ({ id, name: 'return', data: expression });

const DOC = {
  objects1: 'doc-objects1',
  objects2: 'doc-objects2',
  objectCreation: 'doc-object-creation',
  objectCreationAndCallFunction: 'doc-object-creation-and-call-function',
  objectCreationAndCallFunction2: 'doc-object-creation-and-call-function-2',
  objectCreationAndCallFunction3: 'doc-object-creation-and-call-function-3',
  objASum: 'doc-obj-a-sum',
  objCSum: 'doc-obj-c-sum',
  main: 'doc-main',
} as const;

export const MAIN_DOCUMENT_ID = DOC.main;

/** `objAItem`/`objBItem`/`arrOfObjC`-holding `ObjE`, `ObjB`, `ObjD` from the old project are intentionally not ported — see this file's own top comment. */
export const OBJECTS_PROJECT_DOCUMENTS: readonly IProjectDocument[] = [
  objectsStructureDocument(DOC.objects1, 'Objects1', [
    structureThread(OBJ_A_THREAD_ID, 'ObjA', [
      { name: 'x', variableType: int32Type },
      { name: 'y', variableType: int32Type },
      { name: 'z', variableType: int32Type },
    ]),
  ]),
  objectsStructureDocument(DOC.objects2, 'Objects2', [
    structureThread(OBJ_C_THREAD_ID, 'ObjC', [
      { name: 'x', variableType: int32Type },
      { name: 'y', variableType: float32Type },
      { name: 'z', variableType: objAType },
    ]),
  ]),
  functionDocument({
    documentId: DOC.objectCreation,
    name: 'ObjectCreation',
    body: [createVar('cv', 'x', objAType), action('a1', 'x.z = 10'), log('l1', 'x.y is: ${x.z}')],
  }),
  functionDocument({
    documentId: DOC.objectCreationAndCallFunction,
    name: 'ObjectCreationAndCallFunction',
    body: [
      createVar('cv', 'x', objAType),
      action('a1', 'x.x = 10'),
      action('a2', 'x.y = 20'),
      action('a3', 'x.z = 30'),
      callFunction('cf', DOC.objASum, ['x'], 'sum'),
      log('l1', 'objA sum is: ${sum}'),
    ],
  }),
  functionDocument({
    documentId: DOC.objectCreationAndCallFunction2,
    name: 'ObjectCreationAndCallFunction2',
    body: [
      createVar('cv', 'x', objCType),
      action('a1', 'x.z.x = 10'),
      action('a2', 'x.z.y = 20'),
      action('a3', 'x.z.z = 30'),
      action('a4', 'x.x = 40'),
      action('a5', 'x.y = 50'),
      callFunction('cf', DOC.objCSum, ['x'], 'result'),
      log('l1', 'result is: ${result}'),
    ],
  }),
  functionDocument({
    documentId: DOC.objectCreationAndCallFunction3,
    name: 'ObjectCreationAndCallFunction3',
    body: [
      createVar('cv1', 'x', objCType),
      createVar('cv2', 'a', objAType),
      action('a1', 'a.x = 10'),
      action('a2', 'a.y = 20'),
      action('a3', 'a.z = 30'),
      action('a4', 'x.z = a'),
      action('a5', 'x.x = 40'),
      action('a6', 'x.y = 50'),
      callFunction('cf', DOC.objCSum, ['x'], 'result'),
      log('l1', 'result2 is: ${result}'),
    ],
  }),
  functionDocument({
    documentId: DOC.objASum,
    name: 'ObjASum',
    parameters: [{ name: 'objA', type: objAType }],
    returnValue: int32Type,
    body: [returnStatement('r1', 'objA.x + objA.y + objA.z')],
  }),
  functionDocument({
    documentId: DOC.objCSum,
    name: 'ObjCSum',
    parameters: [{ name: 'c', type: objCType }],
    returnValue: int32Type,
    body: [returnStatement('r1', 'c.x + c.y + c.z.x + c.z.y + c.z.z')],
  }),
  functionDocument({
    documentId: DOC.main,
    name: 'main',
    body: [
      callFunction('c1', DOC.objectCreation, [], ''),
      callFunction('c2', DOC.objectCreationAndCallFunction, [], ''),
      callFunction('c3', DOC.objectCreationAndCallFunction2, [], ''),
      callFunction('c4', DOC.objectCreationAndCallFunction3, [], ''),
    ],
  }),
];
