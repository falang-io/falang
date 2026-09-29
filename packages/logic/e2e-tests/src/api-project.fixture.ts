import type { IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import {
  action,
  apiThread,
  callApi,
  callFunction,
  createVar,
  externalApiStructureDocument,
  functionDocument,
  log,
  objectsStructureDocument,
  structureThread,
} from './api-project-builders.js';

/**
 * New-format rewrite of `old/resources/test-projects/api` — the first `call-api` compile-and-run
 * migration (see ADR 0019 (private)'s "Implementation notes" for
 * `call-api`). Unlike `objects`/`conditions`/`arrays`, this project's expected output depends on
 * *hand-written* API implementations, not on anything the DSL itself computes — `call_api` never
 * generated a real network call in the old app, only an interface a human implementation had to
 * satisfy (confirmed by reading `old/resources/test-projects/api/code/cpp/src/main.cpp`, the old
 * project's own hand-written driver). The business logic every compile-and-run test's own
 * hand-written driver must reproduce, read directly from that file:
 * - `ObjectsSum(a, b) = a.x + b.y` (deliberately not a full 6-field sum)
 * - `NumberSum(a, b, c) = a + b + c`
 * - `Object2Concat(a, b) = a.a + b.a` (deliberately not `a.a + a.b + b.a + b.b`)
 * - `StringConcat(a, b, c) = a + b + c`
 * - `BuildObject1(x, y, z) = Object1{x, y, z}`
 * - `BuildObject2(a, b) = Object2{a, b}`
 * The entry function is named `runApiTests`, not the old fixture's `main` — every language's own
 * hand-written driver (not the compiled artifact) owns `main`/`Main` here, since it also has to
 * construct and register the API implementations before calling into any compiled code that uses
 * them (see each `compile-and-run-api*.test.ts`). `main`'s old `"!!test started"` log line is
 * dropped too, same reasoning as every prior migrated project. Node-builder helpers live in a
 * sibling `api-project-builders.ts`, same "stay under `oxlint`'s `max-lines`" split `arrays`'s own
 * fixture already established.
 */

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const stringType: TVariableInfo = { type: 'string' };

const OBJECT1_THREAD_ID = 'thread-object1';
const OBJECT2_THREAD_ID = 'thread-object2';

const object1Type: TVariableInfo = { type: 'struct', id: OBJECT1_THREAD_ID };
const object2Type: TVariableInfo = { type: 'struct', id: OBJECT2_THREAD_ID };

const DOC = {
  objects: 'doc-objects',
  api1: 'doc-api1',
  api2: 'doc-api2',
  test1: 'doc-test1',
  test2: 'doc-test2',
  test3: 'doc-test3',
  test4: 'doc-test4',
  testBuildObject1: 'doc-test-build-object1',
  testBuildObject2: 'doc-test-build-object2',
  run: 'doc-run-api-tests',
} as const;

export const RUN_DOCUMENT_ID = DOC.run;

export const ENDPOINT = {
  objectsSum: 'ep-objects-sum',
  numberSum: 'ep-number-sum',
  object2Concat: 'ep-object2-concat',
  stringConcat: 'ep-string-concat',
  buildObject1: 'ep-build-object1',
  buildObject2: 'ep-build-object2',
} as const;

export const API_PROJECT_DOCUMENTS: readonly IProjectDocument[] = [
  objectsStructureDocument(DOC.objects, 'Objects', [
    structureThread(OBJECT1_THREAD_ID, 'Object1', [
      { name: 'x', variableType: int32Type },
      { name: 'y', variableType: int32Type },
      { name: 'z', variableType: int32Type },
    ]),
    structureThread(OBJECT2_THREAD_ID, 'Object2', [
      { name: 'a', variableType: stringType },
      { name: 'b', variableType: stringType },
    ]),
  ]),
  externalApiStructureDocument(DOC.api1, 'Api1', [
    apiThread('thread-sum', 'Sum', [
      {
        id: ENDPOINT.objectsSum,
        name: 'ObjectsSum',
        parameters: [
          { name: 'a', type: object1Type },
          { name: 'b', type: object1Type },
        ],
        returnValue: int32Type,
      },
      {
        id: ENDPOINT.numberSum,
        name: 'NumberSum',
        parameters: [
          { name: 'a', type: int32Type },
          { name: 'b', type: int32Type },
          { name: 'c', type: int32Type },
        ],
        returnValue: int32Type,
      },
    ]),
    apiThread('thread-concat', 'Concat', [
      {
        id: ENDPOINT.object2Concat,
        name: 'Object2Concat',
        parameters: [
          { name: 'a', type: object2Type },
          { name: 'b', type: object2Type },
        ],
        returnValue: stringType,
      },
      {
        id: ENDPOINT.stringConcat,
        name: 'StringConcat',
        parameters: [
          { name: 'a', type: stringType },
          { name: 'b', type: stringType },
          { name: 'c', type: stringType },
        ],
        returnValue: stringType,
      },
    ]),
  ]),
  externalApiStructureDocument(DOC.api2, 'Api2', [
    apiThread('thread-build-object', 'BuildObject', [
      {
        id: ENDPOINT.buildObject1,
        name: 'BuildObject1',
        parameters: [
          { name: 'x', type: int32Type },
          { name: 'y', type: int32Type },
          { name: 'z', type: int32Type },
        ],
        returnValue: object1Type,
      },
      {
        id: ENDPOINT.buildObject2,
        name: 'BuildObject2',
        parameters: [
          { name: 'a', type: stringType },
          { name: 'b', type: stringType },
        ],
        returnValue: object2Type,
      },
    ]),
  ]),
  functionDocument({
    documentId: DOC.test1,
    name: 'Test1',
    body: [
      createVar('cv-a', 'a', object1Type),
      createVar('cv-b', 'b', object1Type),
      action('a1', 'a.x = 1'),
      action('a2', 'a.y = 2'),
      action('a3', 'a.z = 3'),
      action('a4', 'b.x = 4'),
      action('a5', 'b.y = 5'),
      action('a6', 'b.z = 6'),
      callApi('ca', DOC.api1, ENDPOINT.objectsSum, ['a', 'b'], 'result'),
      log('l1', 'ObjectsSumResult: ${result}'),
    ],
  }),
  functionDocument({
    documentId: DOC.test2,
    name: 'Test2',
    body: [
      createVar('cv-x', 'x', int32Type, '10'),
      callApi('ca', DOC.api1, ENDPOINT.numberSum, ['x', '20', '30'], 'result'),
      log('l1', 'Sumbers sum is: ${result}'),
    ],
  }),
  functionDocument({
    documentId: DOC.test3,
    name: 'Test3',
    body: [
      createVar('cv-a', 'a', object2Type),
      createVar('cv-b', 'b', object2Type),
      action('a1', 'a.a = "123"'),
      action('a2', 'a.b = "456"'),
      action('a3', 'b.a = "78"'),
      action('a4', 'b.b = "90"'),
      callApi('ca', DOC.api1, ENDPOINT.object2Concat, ['a', 'b'], 'result'),
      log('l1', 'Objec2Concat: ${result}'),
    ],
  }),
  functionDocument({
    documentId: DOC.test4,
    name: 'Test4',
    body: [
      createVar('cv-a', 'a', stringType, '"123"'),
      createVar('cv-b', 'b', stringType, '"123"'),
      createVar('cv-c', 'c', stringType, '"123"'),
      callApi('ca', DOC.api1, ENDPOINT.stringConcat, ['a', 'b', 'c'], 'result'),
      log('l1', 'StringConcat: ${result}'),
    ],
  }),
  functionDocument({
    documentId: DOC.testBuildObject1,
    name: 'TestBuildObject1',
    body: [
      createVar('cv-x', 'x', int32Type, '0'),
      createVar('cv-y', 'y', int32Type, '0'),
      createVar('cv-z', 'z', int32Type, '0'),
      callApi('ca1', DOC.api2, ENDPOINT.buildObject1, ['x', 'y', 'z'], 'o1'),
      createVar('cv-b', 'b', object1Type),
      action('a1', 'b.x = 4'),
      action('a2', 'b.y = 5'),
      action('a3', 'b.z = 6'),
      callApi('ca2', DOC.api1, ENDPOINT.objectsSum, ['o1', 'b'], 'sum'),
      log('l1', 'TestBuildObject1Result is: ${sum}'),
    ],
  }),
  functionDocument({
    documentId: DOC.testBuildObject2,
    name: 'TestBuildObject2',
    body: [
      createVar('cv-a', 'a', stringType, '"asd"'),
      createVar('cv-b', 'b', stringType, '"xyz"'),
      callApi('ca1', DOC.api2, ENDPOINT.buildObject2, ['a', 'b'], 'o'),
      createVar('cv-o2', 'o2', object2Type),
      action('a1', 'o2.a = "qwe"'),
      action('a2', 'o2.b = "zxc"'),
      callApi('ca2', DOC.api1, ENDPOINT.object2Concat, ['o', 'o2'], 'res'),
      log('l1', 'TestBuildObjec2 is: ${res}'),
    ],
  }),
  functionDocument({
    documentId: DOC.run,
    name: 'runApiTests',
    body: [
      callFunction('c1', DOC.test1, [], ''),
      callFunction('c2', DOC.test2, [], ''),
      callFunction('c3', DOC.test3, [], ''),
      callFunction('c4', DOC.test4, [], ''),
      callFunction('c5', DOC.testBuildObject1, [], ''),
      callFunction('c6', DOC.testBuildObject2, [], ''),
    ],
  }),
];
