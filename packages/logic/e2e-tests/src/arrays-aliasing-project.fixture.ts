import type { IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import {
  action,
  arrInsert,
  arrPush,
  arrSlice,
  callFunction,
  createVar,
  foreach,
  functionDocument,
  log,
} from './arrays-project-builders.js';

/**
 * Aliasing regression: `arr-slice` is a copy in TypeScript, so inserting a slice result into another
 * array must never change the array the slice came from. In Go the slice used to share its source's
 * backing array, and `arr-insert`'s inner `append(insertArr, …)` wrote the target's tail into that
 * shared spare capacity. Expected output is the TypeScript semantics, identical on every target.
 */

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const int32ArrayType: TVariableInfo = { type: 'array', elementType: int32Type, dimensions: 1 };

const DOC = {
  print: 'doc-print',
  insertScenario: 'doc-insert-scenario',
  sliceScenario: 'doc-slice-scenario',
  main: 'doc-main',
} as const;

export const ALIASING_MAIN_DOCUMENT_ID = DOC.main;

const printDocument = functionDocument({
  documentId: DOC.print,
  name: 'PrintArray',
  parameters: [
    { name: 'label', type: { type: 'string' } },
    { name: 'arr', type: int32ArrayType },
  ],
  body: [log('l1', '${label}'), foreach('fe', 'arr', 'x', [log('l2', '${x}')])],
});

const insertScenarioDocument = functionDocument({
  documentId: DOC.insertScenario,
  name: 'InsertScenario',
  body: [
    createVar('a', 'a', int32ArrayType),
    arrPush('a1', 'a', '1'),
    arrPush('a2', 'a', '2'),
    arrPush('a3', 'a', '3'),
    arrPush('a4', 'a', '4'),
    arrSlice('sl', 'a', 'c', '0', '1'),
    createVar('d', 'd', int32ArrayType),
    arrPush('d1', 'd', '9'),
    arrPush('d2', 'd', '8'),
    arrInsert('ins', 'd', '1', 'c'),
    callFunction('p1', DOC.print, ['"a"', 'a']),
    callFunction('p2', DOC.print, ['"d"', 'd']),
  ],
});

const sliceScenarioDocument = functionDocument({
  documentId: DOC.sliceScenario,
  name: 'SliceScenario',
  body: [
    createVar('a', 'a', int32ArrayType),
    arrPush('a1', 'a', '1'),
    arrPush('a2', 'a', '2'),
    arrPush('a3', 'a', '3'),
    arrPush('a4', 'a', '4'),
    arrSlice('sl', 'a', 'e', '0', '2'),
    action('set', 'e[0] = 100'),
    arrPush('pe', 'e', '7'),
    callFunction('p1', DOC.print, ['"a"', 'a']),
    callFunction('p2', DOC.print, ['"e"', 'e']),
  ],
});

const mainDocument = functionDocument({
  documentId: DOC.main,
  name: 'main',
  body: [callFunction('c1', DOC.insertScenario, []), callFunction('c2', DOC.sliceScenario, [])],
});

export const ARRAYS_ALIASING_PROJECT_DOCUMENTS: readonly IProjectDocument[] = [
  printDocument,
  insertScenarioDocument,
  sliceScenarioDocument,
  mainDocument,
];

export const ARRAYS_ALIASING_EXPECTED_RESULT_LINES = [
  'a',
  '1',
  '2',
  '3',
  '4',
  'd',
  '9',
  '1',
  '8',
  'a',
  '1',
  '2',
  '3',
  '4',
  'e',
  '100',
  '2',
  '7',
];
