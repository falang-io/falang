import type { INode, IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';

/**
 * New-format rewrite of `old/resources/test-projects/conditions` — the second compile-and-run
 * migration after the `objects` pilot (see ADR 0019 (private)'s "Compile-and-run test migration"
 * section). Unlike `objects`, this project exercises `if`/`switch`/`from-to-cycle` and multi-level
 * `break`/`continue` through a nested `switch` — the riskiest part of the statement-level `cpp`
 * compiler, until now covered only by one synthetic unit test
 * (`compile-cpp-statements.test.ts`). 8 documents, expected stdout in `compile-and-run-conditions.test.ts`.
 *
 * Deliberate differences from the old fixture (not bugs), both explained in ADR 0019 (private):
 * - `from-to-cycle` in the current compiler emits an *inclusive* ascending loop
 *   (`for (int item = from; item <= to; item++)`, matching `@falang/workflow-compiler`'s own
 *   pre-existing behavior), while the old app's `from_to_cycle` was exclusive of `to`
 *   (`item < to`). Every `to` bound below is the old fixture's `to` minus 1, to reproduce the exact
 *   same iteration counts.
 * - `TestReturn`'s old fixture stored the computed sum in a variable literally named `returnValue`
 *   (an old-app-wide convention: `return` with no expression always emits `return returnValue;` for
 *   a non-void function) before an argument-less `return`. The current compiler's `return` node just
 *   takes an expression directly, so the intermediate variable is dropped — `return x + y` inline.
 */

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

const functionDocument = (
  documentId: string,
  name: string,
  body: readonly INode[],
  returnValue?: TVariableInfo,
): IProjectDocument => ({
  id: documentId,
  type: 'function',
  name,
  root: {
    id: `${documentId}-root`,
    name: 'function',
    children: [
      { id: `${documentId}-header`, name: 'function-header', data: '' },
      { id: `${documentId}-body`, name: 'function-body', data: { parameters: [], returnValue }, children: body },
      { id: `${documentId}-footer`, name: 'function-footer', data: '' },
    ],
  },
});

const log = (id: string, message: string): INode => ({ id, name: 'log', data: message });

const callFunction = (id: string, schemeId: string, returnVariable = ''): INode => ({
  id,
  name: 'call-function',
  data: { schemeId, parameters: [], returnVariable },
});

const returnStatement = (id: string, expression = ''): INode => ({ id, name: 'return', data: expression });

const breakOut = (id: string, level = 1): INode => ({
  id,
  name: 'break',
  ...(level > 1 ? { meta: { outLevel: level } } : {}),
});

const continueOut = (id: string, level = 1): INode => ({
  id,
  name: 'continue',
  ...(level > 1 ? { meta: { outLevel: level } } : {}),
});

interface IIfBranch {
  readonly children?: readonly INode[];
  readonly out?: INode;
}

const ifBranch = (id: string, branch: IIfBranch): INode => ({
  id,
  name: 'if-child',
  ...(branch.children ? { children: branch.children } : {}),
  ...(branch.out ? { out: branch.out } : {}),
});

/** `thenBranch` runs when `condition` is true, `elseBranch` when false — plain positional children, no `meta.trueOnRight` needed (that flag only matters for the old editor's visual layout, not compiled semantics). */
const ifNode = (id: string, condition: string, thenBranch: IIfBranch, elseBranch: IIfBranch = {}): INode => ({
  id,
  name: 'if',
  data: condition,
  children: [ifBranch(`${id}-then`, thenBranch), ifBranch(`${id}-else`, elseBranch)],
});

const switchOption = (id: string, value: string, children: readonly INode[] = [], out?: INode): INode => ({
  id,
  name: 'switch-option',
  data: value,
  ...(children.length > 0 ? { children } : {}),
  ...(out ? { out } : {}),
});

const switchNode = (id: string, expression: string, options: readonly INode[]): INode => ({
  id,
  name: 'switch',
  data: expression,
  children: options,
});

/** `to` is already translated to the inclusive bound — see this file's own top comment. */
const fromToCycle = (id: string, from: string, to: string, item: string, children: readonly INode[]): INode => ({
  id,
  name: 'from-to-cycle',
  data: { from, to, item },
  children,
});

const DOC = {
  testNestedSwitch: 'doc-test-nested-switch',
  testBreak: 'doc-test-break',
  testBreak2: 'doc-test-break2',
  testContinue: 'doc-test-continue',
  testContinue2: 'doc-test-continue2',
  testInSwitch: 'doc-test-in-switch',
  testReturn: 'doc-test-return',
  testReturnVoid: 'doc-test-return-void',
  main: 'doc-main',
} as const;

export const MAIN_DOCUMENT_ID = DOC.main;

/**
 * `TestNestedSwitch` — old `to=10` (exclusive) x/y loops translated to `to=9` (inclusive). The
 * `default` case of the first `switch(x)` and `case 1`'s `log` in the second `switch(x)` are dead
 * code in this project's actual execution (the `x`-loop's own `break` level=2, below, always exits
 * before `x` reaches any value the old app's own comment didn't already mark "Should not be here"),
 * exactly as in the old fixture — kept for fidelity to the original document, not because they run.
 */
const testNestedSwitchDocument = functionDocument(DOC.testNestedSwitch, 'TestNestedSwitch', [
  log('l1', 'TestNestedSwitch'),
  fromToCycle('x-loop', '0', '9', 'x', [
    switchNode('sw1', 'x', [
      switchOption('sw1-default', 'default', [log('l2', 'Should not be here')]),
      switchOption('sw1-case0', '0', [
        fromToCycle('y-loop-0', '0', '9', 'y', [ifNode('if-y0-case0', 'y == 0', {}, { out: breakOut('brk1', 1) })]),
      ]),
      switchOption('sw1-case1', '1', [
        fromToCycle('y-loop-1', '0', '9', 'y', [ifNode('if-y0-case1', 'y == 0', {}, { out: breakOut('brk2', 2) })]),
      ]),
    ]),
    log('l3', 'Should be here1'),
    switchNode('sw2', 'x', [
      switchOption('sw2-case0', '0', []),
      switchOption('sw2-case1', '1', [log('l4', 'Should not be here x = 1')]),
    ]),
    log('l5', 'Should be here2'),
  ]),
  log('l6', 'TestNestedSwitch finished'),
]);

const testBreakDocument = functionDocument(DOC.testBreak, 'TestBreak', [
  log('l1', 'TestBreak'),
  fromToCycle('x-loop', '0', '3', 'x', [
    ifNode(
      'if1',
      'x > 1',
      { children: [log('l2', 'Break when x=${x}')], out: breakOut('brk1', 1) },
      { children: [log('l3', 'Not break when x=${x}')] },
    ),
  ]),
]);

const testBreak2Document = functionDocument(DOC.testBreak2, 'TestBreak2', [
  log('l1', 'TestBreak2'),
  fromToCycle('x-loop', '0', '2', 'x', [
    log('l2', 'Cycle start, x: ${x}'),
    fromToCycle('y-loop', '0', '3', 'y', [
      ifNode(
        'if1',
        'x > 1',
        { children: [log('l3', 'Break2 when x=${x}, y=${y}')], out: breakOut('brk1', 2) },
        { children: [log('l4', 'Not break2 when x=${x}, y=${y}')] },
      ),
    ]),
  ]),
]);

const testContinueDocument = functionDocument(DOC.testContinue, 'TestContinue', [
  log('l1', 'TestContinue'),
  fromToCycle('x-loop', '0', '3', 'x', [
    ifNode(
      'if1',
      'x > 1',
      { children: [log('l2', 'Continue when x=${x}')], out: continueOut('cnt1', 1) },
      { children: [log('l3', 'Not continue when x=${x}'), log('l4', 'Some code')] },
    ),
  ]),
]);

const testContinue2Document = functionDocument(DOC.testContinue2, 'TestContinue2', [
  log('l1', 'TestContinue2'),
  fromToCycle('x-loop', '0', '2', 'x', [
    log('l2', 'Cycle start, x: ${x}'),
    fromToCycle('y-loop', '0', '3', 'y', [
      log('l3', 'x=${x}, y=${y}'),
      ifNode(
        'if1',
        'y > 2',
        { children: [log('l4', 'Continue2 when x=${x}, y=${y}')], out: continueOut('cnt1', 2) },
        { children: [log('l5', 'Not continue when x=${x}, y=${y}')] },
      ),
    ]),
  ]),
]);

const testInSwitchDocument = functionDocument(DOC.testInSwitch, 'TestInSwitch', [
  log('l1', 'Test in switch'),
  fromToCycle('x-loop', '0', '4', 'x', [
    fromToCycle('y-loop', '0', '4', 'y', [
      log('l2', 'x=${x}, y=${y}'),
      switchNode('sw-x', 'x', [
        switchOption('sw-x-case0', '0', [log('l3', 'Zero thread')]),
        switchOption('sw-x-default', 'default', [
          switchNode('sw-y', 'y', [
            switchOption('sw-y-default', 'default', [log('l4', 'Default thread')]),
            switchOption('sw-y-case3', '3', [log('l5', 'Y is 3, break')], breakOut('brk1', 1)),
          ]),
        ]),
        switchOption('sw-x-case2', '2', [log('l6', 'Break2 thread')], breakOut('brk2', 2)),
      ]),
    ]),
  ]),
]);

const testReturnDocument = functionDocument(
  DOC.testReturn,
  'TestReturn',
  [
    fromToCycle('x-loop', '0', '9', 'x', [
      fromToCycle('y-loop', '0', '9', 'y', [
        ifNode('if-x', 'x > 5', {
          children: [ifNode('if-y', 'y == 5', { out: returnStatement('ret1', 'x + y') })],
        }),
      ]),
    ]),
  ],
  int32Type,
);

const testReturnVoidDocument = functionDocument(DOC.testReturnVoid, 'TestReturnVoid', [
  fromToCycle('x-loop', '0', '9', 'x', [
    fromToCycle('y-loop', '0', '9', 'y', [
      ifNode('if-x', 'x > 5', {
        children: [
          ifNode(
            'if-y',
            'y < 5',
            {},
            { children: [log('l1', 'TestReturnVoid x:${x},y:${y}')], out: returnStatement('ret1', '') },
          ),
        ],
      }),
    ]),
  ]),
]);

const mainDocument = functionDocument(DOC.main, 'main', [
  callFunction('c1', DOC.testNestedSwitch),
  callFunction('c2', DOC.testBreak),
  callFunction('c3', DOC.testBreak2),
  callFunction('c4', DOC.testContinue),
  callFunction('c5', DOC.testContinue2),
  callFunction('c6', DOC.testInSwitch),
  callFunction('c7', DOC.testReturnVoid),
  callFunction('c8', DOC.testReturn, 'testReturnResult'),
  log('l1', 'testReturnResult=${testReturnResult}'),
]);

export const CONDITIONS_PROJECT_DOCUMENTS: readonly IProjectDocument[] = [
  testNestedSwitchDocument,
  testBreakDocument,
  testBreak2Document,
  testContinueDocument,
  testContinue2Document,
  testInSwitchDocument,
  testReturnDocument,
  testReturnVoidDocument,
  mainDocument,
];
