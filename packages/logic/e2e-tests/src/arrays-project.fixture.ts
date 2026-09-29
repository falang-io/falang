import type { IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import {
  action,
  arrPop,
  arrPush,
  arrShift,
  arrUnshift,
  callFunction,
  createVar,
  foreach,
  fromToCycle,
  functionDocument,
  log,
  objectsStructureDocument,
  structureThread,
} from './arrays-project-builders.js';

/**
 * New-format rewrite of `old/resources/test-projects/arrays` — the third compile-and-run migration
 * after `objects`/`conditions` (see ADR 0019 (private)'s "Compile-and-run test migration"
 * section). Exercises `arr-push`/`arr-pop`/`arr-shift`/`arr-unshift`, `foreach`, exactly one
 * `from-to-cycle`, and a struct-typed array — no `if`/`switch`/`break`/`continue` at all, unlike
 * `conditions`. 14 documents, expected stdout in `compile-and-run-arrays.test.ts`.
 *
 * Two real gaps found while porting this project (both explained in full in ADR 0019 (private)):
 *
 * 1. **Array literals aren't portable to C++.** The old fixture initializes arrays with a literal
 *    right in `create_var` (`x = [1,2,3]`), but `walk-expression.ts`'s `emitPortableExpression`
 *    explicitly rejects array/object literals (`UnsupportedConstructError`) — not in the whitelist.
 *    Fixed here as a **fixture-only workaround**, not a compiler change: declare the array empty
 *    (`create-var` with no `value`, which `emitCreateVar` already renders as `std::vector<T> x{};`)
 *    then append each element with `arr-push` (also already implemented). Chosen over teaching
 *    `walk-expression.ts` array literals because array-literal initializers are a one-off need of
 *    this one fixture, not a generally-needed construct — matches the ADR's "explicit error, not a
 *    guess" posture: extend the whitelist when a real, repeated need shows up, not speculatively.
 * 2. **Array element access (`arr[index]`) wasn't portable to C++ either** — found while porting
 *    `RunFunctions`'s `a = x[index]` (the source of `result.txt`'s "Second item: 2" line), a
 *    genuinely load-bearing use no fixture rewrite could dodge (unlike gap 1's array literal, which
 *    only ever fed a `create-var` initializer). Unlike gap 1, this **was** fixed as a real compiler
 *    feature (`ILanguageAdapter.emitElementAccess` + a `ts.isElementAccessExpression` branch in
 *    `walk-expression.ts` + a narrow C++ implementation restricted to array-typed receivers) rather
 *    than a fixture workaround — array indexing is a fundamental, universally-needed array operation
 *    (this project's whole point is arrays), not a one-off shape the way an inline literal is.
 *
 * `Object2` (defined in the old project's `Structures` document but never actually instantiated by
 * any function there — only `Object1` is) is dropped, same "only port structs the program logic
 * actually exercises" call `objects-project.fixture.ts` already made for `ObjB`/`ObjD`/`ObjE`.
 * `main`'s old `"!!test started"` log line is dropped too, same reasoning as both prior fixtures
 * (`old/.../runners.ts`'s host-process banner-slicing marker, irrelevant to the Docker harness).
 *
 * Arrays are passed to `call-function` by value (C++ value parameters, confirmed against
 * `compile-cpp-function.ts`'s `buildCppSignatureLine` — no `&`), so e.g. `RunFunctions`'s own `x`
 * is unaffected by `TestPush`/`TestPop`/`TestShift`/`TestUnshift` each receiving and mutating their
 * own local copy — exactly what the old fixture's own `result.txt` already relies on (`ArrSum(x)`
 * still sees `[1, 2, 3]`, not a version mutated by an earlier call).
 *
 * `RunTestObjects`'s single `from_to_cycle` is old `from=0, to=5` (exclusive of `to`, iterating
 * `index` 0..4) — translated to the current, *inclusive* `from-to-cycle` (see `conditions`'s own
 * fixture comment for the general rule) as `from=0, to=4`.
 */

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const stringType: TVariableInfo = { type: 'string' };
const int32ArrayType: TVariableInfo = { type: 'array', elementType: int32Type, dimensions: 1 };
const stringArrayType: TVariableInfo = { type: 'array', elementType: stringType, dimensions: 1 };

const OBJ_1_THREAD_ID = 'thread-obj1';
const obj1Type: TVariableInfo = { type: 'struct', id: OBJ_1_THREAD_ID };
const obj1ArrayType: TVariableInfo = { type: 'array', elementType: obj1Type, dimensions: 1 };

const DOC = {
  structures: 'doc-structures',
  createAndPrintNumberArray: 'doc-create-and-print-number-array',
  arrSum: 'doc-arr-sum',
  testPop: 'doc-test-pop',
  testPush: 'doc-test-push',
  testShift: 'doc-test-shift',
  testStringArray: 'doc-test-string-array',
  testUnshift: 'doc-test-unshift',
  printNumberArray: 'doc-print-number-array',
  printStringArray: 'doc-print-string-array',
  runFunctions: 'doc-run-functions',
  printObject1Sum: 'doc-print-object1-sum',
  runTestObjects: 'doc-run-test-objects',
  main: 'doc-main',
} as const;

export const MAIN_DOCUMENT_ID = DOC.main;

const printNumberArrayDocument = functionDocument({
  documentId: DOC.printNumberArray,
  name: 'PrintNumberArray',
  parameters: [{ name: 'arr', type: int32ArrayType }],
  body: [log('l1', 'PrintNumberArray'), foreach('fe', 'arr', 'x', [log('l2', '${x}')])],
});

const printStringArrayDocument = functionDocument({
  documentId: DOC.printStringArray,
  name: 'PrintStringArray',
  parameters: [{ name: 'arr', type: stringArrayType }],
  body: [log('l1', 'PrintStringArray'), foreach('fe', 'arr', 'x', [log('l2', '${x}')])],
});

const createAndPrintNumberArrayDocument = functionDocument({
  documentId: DOC.createAndPrintNumberArray,
  name: 'CreateAndPrintNumberArray',
  body: [
    createVar('cv', 'x', int32ArrayType),
    arrPush('p1', 'x', '1'),
    arrPush('p2', 'x', '2'),
    arrPush('p3', 'x', '3'),
    callFunction('cf', DOC.printNumberArray, ['x']),
  ],
});

const arrSumDocument = functionDocument({
  documentId: DOC.arrSum,
  name: 'ArrSum',
  parameters: [{ name: 'arr', type: int32ArrayType }],
  body: [
    createVar('cv', 'x', int32Type, '0'),
    foreach('fe', 'arr', 'item', [action('a1', 'x = x + item')]),
    log('l1', 'Sum is: ${x}'),
  ],
});

const testPushDocument = functionDocument({
  documentId: DOC.testPush,
  name: 'TestPush',
  parameters: [{ name: 'arrParam', type: int32ArrayType }],
  body: [
    log('l1', 'TestPush'),
    createVar('cv', 'arr', int32ArrayType, 'arrParam'),
    arrPush('p1', 'arr', '5'),
    callFunction('cf', DOC.printNumberArray, ['arr']),
  ],
});

const testPopDocument = functionDocument({
  documentId: DOC.testPop,
  name: 'TestPop',
  parameters: [{ name: 'arrParam', type: int32ArrayType }],
  body: [
    log('l1', 'TestPop'),
    createVar('cv', 'arr', int32ArrayType, 'arrParam'),
    arrPop('p1', 'arr', 'z'),
    log('l2', 'Pop from array: ${z}'),
    callFunction('cf', DOC.printNumberArray, ['arr']),
  ],
});

const testShiftDocument = functionDocument({
  documentId: DOC.testShift,
  name: 'TestShift',
  parameters: [{ name: 'arrParam', type: int32ArrayType }],
  body: [
    log('l1', 'TestShift'),
    createVar('cv', 'arr', int32ArrayType, 'arrParam'),
    arrShift('p1', 'arr', 'x'),
    log('l2', 'Shifted var: ${x}'),
    callFunction('cf', DOC.printNumberArray, ['arr']),
  ],
});

const testUnshiftDocument = functionDocument({
  documentId: DOC.testUnshift,
  name: 'TestUnshift',
  parameters: [{ name: 'arrParam', type: int32ArrayType }],
  body: [
    log('l1', 'TestUnshift'),
    createVar('cv', 'arr', int32ArrayType, 'arrParam'),
    arrUnshift('p1', 'arr', '123'),
    callFunction('cf', DOC.printNumberArray, ['arr']),
  ],
});

const testStringArrayDocument = functionDocument({
  documentId: DOC.testStringArray,
  name: 'TestStringArray',
  body: [
    createVar('cv1', 'arr', stringArrayType),
    createVar('cv2', 'str', stringType, '"hello"'),
    arrPush('p1', 'arr', 'str'),
    callFunction('cf', DOC.printStringArray, ['arr']),
  ],
});

const runFunctionsDocument = functionDocument({
  documentId: DOC.runFunctions,
  name: 'RunFunctions',
  body: [
    createVar('cv', 'x', int32ArrayType),
    arrPush('p1', 'x', '1'),
    arrPush('p2', 'x', '2'),
    arrPush('p3', 'x', '3'),
    callFunction('cf1', DOC.testPush, ['x']),
    callFunction('cf2', DOC.testPop, ['x']),
    callFunction('cf3', DOC.testShift, ['x']),
    callFunction('cf4', DOC.testUnshift, ['x']),
    callFunction('cf5', DOC.arrSum, ['x']),
    createVar('cv2', 'index', int32Type, '1'),
    createVar('cv3', 'a', int32Type, 'x[index]'),
    log('l1', 'Second item: ${a}'),
  ],
});

const printObject1SumDocument = functionDocument({
  documentId: DOC.printObject1Sum,
  name: 'PrintObject1Sum',
  parameters: [{ name: 'arr', type: obj1ArrayType }],
  body: [
    createVar('cv', 'sum', int32Type, '0'),
    foreach('fe', 'arr', 'item', [action('a1', 'sum = sum + item.x')]),
    log('l1', 'Sum is: ${sum}'),
  ],
});

/** `to=4` here is the old fixture's `to=5` (exclusive) minus 1 — see this file's own top comment. */
const runTestObjectsDocument = functionDocument({
  documentId: DOC.runTestObjects,
  name: 'RunTestObjects',
  body: [
    createVar('cv', 'arr', obj1ArrayType),
    fromToCycle('loop', '0', '4', 'index', [
      createVar('cv2', 'obj', obj1Type),
      action('a1', 'obj.x = index'),
      arrPush('p1', 'arr', 'obj'),
    ]),
    callFunction('cf', DOC.printObject1Sum, ['arr']),
  ],
});

const mainDocument = functionDocument({
  documentId: DOC.main,
  name: 'main',
  body: [
    callFunction('c1', DOC.createAndPrintNumberArray, []),
    callFunction('c2', DOC.runFunctions, []),
    callFunction('c3', DOC.testStringArray, []),
    callFunction('c4', DOC.runTestObjects, []),
  ],
});

/** `Object2` from the old project's `Structures` document is intentionally not ported — see this file's own top comment. */
export const ARRAYS_PROJECT_DOCUMENTS: readonly IProjectDocument[] = [
  objectsStructureDocument(DOC.structures, 'Structures', [
    structureThread(OBJ_1_THREAD_ID, 'Object1', [{ name: 'x', variableType: int32Type }]),
  ]),
  createAndPrintNumberArrayDocument,
  arrSumDocument,
  testPopDocument,
  testPushDocument,
  testShiftDocument,
  testStringArrayDocument,
  testUnshiftDocument,
  printNumberArrayDocument,
  printStringArrayDocument,
  runFunctionsDocument,
  printObject1SumDocument,
  runTestObjectsDocument,
  mainDocument,
];
