/**
 * The expected stdout of each migrated old test project, taken verbatim from that project's own
 * `result.txt` in the vendored old app (`resources/test-projects/<name>/result.txt`) — the single
 * expectation every target language's own compile-and-run test asserts against, which is the whole
 * point of this suite: the same visual project must produce byte-identical output on cpp, Go, Rust and
 * C# alike.
 *
 * Extracted here once the C# target would have become the fourth copy of each list (see
 * ADR 0019 (private)). Each project's own fixture file documents the
 * deliberate differences from the old fixture that don't change its output (e.g. `main`'s dropped
 * `"!!test started"` marker line).
 */

export const OBJECTS_EXPECTED_RESULT_LINES = ['x.y is: 10', 'objA sum is: 60', 'result is: 150', 'result2 is: 150'];

export const CONDITIONS_EXPECTED_RESULT_LINES = [
  'TestNestedSwitch',
  'Should be here1',
  'Should be here2',
  'TestNestedSwitch finished',
  'TestBreak',
  'Not break when x=0',
  'Not break when x=1',
  'Break when x=2',
  'TestBreak2',
  'Cycle start, x: 0',
  'Not break2 when x=0, y=0',
  'Not break2 when x=0, y=1',
  'Not break2 when x=0, y=2',
  'Not break2 when x=0, y=3',
  'Cycle start, x: 1',
  'Not break2 when x=1, y=0',
  'Not break2 when x=1, y=1',
  'Not break2 when x=1, y=2',
  'Not break2 when x=1, y=3',
  'Cycle start, x: 2',
  'Break2 when x=2, y=0',
  'TestContinue',
  'Not continue when x=0',
  'Some code',
  'Not continue when x=1',
  'Some code',
  'Continue when x=2',
  'Continue when x=3',
  'TestContinue2',
  'Cycle start, x: 0',
  'x=0, y=0',
  'Not continue when x=0, y=0',
  'x=0, y=1',
  'Not continue when x=0, y=1',
  'x=0, y=2',
  'Not continue when x=0, y=2',
  'x=0, y=3',
  'Continue2 when x=0, y=3',
  'Cycle start, x: 1',
  'x=1, y=0',
  'Not continue when x=1, y=0',
  'x=1, y=1',
  'Not continue when x=1, y=1',
  'x=1, y=2',
  'Not continue when x=1, y=2',
  'x=1, y=3',
  'Continue2 when x=1, y=3',
  'Cycle start, x: 2',
  'x=2, y=0',
  'Not continue when x=2, y=0',
  'x=2, y=1',
  'Not continue when x=2, y=1',
  'x=2, y=2',
  'Not continue when x=2, y=2',
  'x=2, y=3',
  'Continue2 when x=2, y=3',
  'Test in switch',
  'x=0, y=0',
  'Zero thread',
  'x=0, y=1',
  'Zero thread',
  'x=0, y=2',
  'Zero thread',
  'x=0, y=3',
  'Zero thread',
  'x=0, y=4',
  'Zero thread',
  'x=1, y=0',
  'Default thread',
  'x=1, y=1',
  'Default thread',
  'x=1, y=2',
  'Default thread',
  'x=1, y=3',
  'Y is 3, break',
  'x=2, y=0',
  'Break2 thread',
  'TestReturnVoid x:6,y:5',
  'testReturnResult=11',
];

export const API_EXPECTED_RESULT_LINES = [
  'ObjectsSumResult: 6',
  'Sumbers sum is: 60',
  'Objec2Concat: 12378',
  'StringConcat: 123123123',
  'TestBuildObject1Result is: 5',
  'TestBuildObjec2 is: asdqwe',
];

/**
 * `result.txt`'s own `***` suffix convention (see old `packages/tests/logic-compile-and-run/src/index.ts`'s
 * own comparison loop) marks a line as a *prefix* match rather than exact equality — needed only here,
 * since MonteCarlo's pi estimate is inherently non-deterministic (every other migrated project's output
 * is fully deterministic and asserted via exact `toEqual`). See `expect-result-lines.ts` for the assertion
 * this drives and ADR 0019 (private)'s MonteCarlo implementation notes for the full picture.
 */
export const MONTECARLO_EXPECTED_RESULT_LINES = ['Calculation result: 3.14***'];

export const ARRAYS_EXPECTED_RESULT_LINES = [
  'PrintNumberArray',
  '1',
  '2',
  '3',
  'TestPush',
  'PrintNumberArray',
  '1',
  '2',
  '3',
  '5',
  'TestPop',
  'Pop from array: 3',
  'PrintNumberArray',
  '1',
  '2',
  'TestShift',
  'Shifted var: 1',
  'PrintNumberArray',
  '2',
  '3',
  'TestUnshift',
  'PrintNumberArray',
  '123',
  '1',
  '2',
  '3',
  'Sum is: 6',
  'Second item: 2',
  'PrintStringArray',
  'hello',
  'Sum is: 10',
];
