import type { INode, IProjectDocument } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';

/**
 * New-format rewrite of `old/resources/test-projects/MonteCarlo` — the fourth and last old test
 * project, previously misdiagnosed in this ADR's own earlier text as blocked on `call_api` (it isn't;
 * see ADR 0019 (private)'s "MonteCarlo — actually diagnosed" follow-up entry for the real
 * blockers, all addressed here). 2 documents (`calculateMonteCarlo`, `main`), shared across all four
 * targets — unlike `objects`, no per-target fork is needed, because every numeric variable below is
 * `float64` throughout (see the second point) rather than triggering the numeric-coercion gap.
 *
 * Deliberate differences from the old fixture (not bugs):
 * - `r ^ 2` / `x ^ 2 + y ^ 2` used mathjs's power operator; real TypeScript's `^` is bitwise XOR (this
 *   ADR's own "no new expression grammar" decision means the fixture must be real, portable TS, not a
 *   1:1 token transcription of the old mathjs text). Both exponents are the literal `2`, so squaring by
 *   multiplication (`r * r`, `x * x + y * y`) is the natural TS spelling — not a `Math.pow(x, 2)`
 *   workaround, and it avoids `Math.pow`'s own float-returning signature ever meeting a
 *   differently-typed left-hand side (see the next point).
 * - Every numeric variable in `calculateMonteCarlo` other than the loop bound `roundsTotal` (`int32`,
 *   untouched by any of this) is `float64`, not the old fixture's mix of `int32`/`float32` — three
 *   separate real gaps this migration found, each independently pointing at the same fix:
 *   1. `pointsTotal`/`pointsInside` were `int32` in the old fixture; old cpp codegen (confirmed by
 *      reading its own checked-in output, `code/cpp/src/falang/calculateMonteCarlo.cpp`) cast *every*
 *      operand to the assignment's own result type at each operator
 *      (`(float)(4) * (float)(pointsInside) / (float)(pointsTotal)`), a numeric-coercion mechanism
 *      this compiler doesn't have (a real, already-documented gap — see the ADR's
 *      "numeric-type-coercion gap" follow-up). Left as `int32`, `pi = 4 * pointsInside / pointsTotal`
 *      would be *integer* division in cpp/Go/Rust/C# (silently wrong — always ~0, unlike
 *      TypeScript's always-float `/`).
 *   2. `r`/`r2`/`x`/`y`/`currentR2` need to match `Math.random`'s own return type, which is `float64`
 *      on every target (Go's `rand.Float64()`, Rust's `rand::thread_rng().gen::<f64>()`, C#'s
 *      `Random.NextDouble()`, cpp's own mapping cast to `double` to match) — Go and Rust have **no**
 *      implicit conversion between `float32`/`f32` and `float64`/`f64`, even though it would be a
 *      widening, always-safe one in every other target.
 *   3. A third, C#-specific gap this migration found, affecting `pointsTotal`/`pointsInside`
 *      specifically: `sharp-adapter.ts`'s `emitAssignment` is a deliberate no-op passthrough (see its
 *      own doc comment) — a plain `action` reassignment (`pointsTotal = pointsTotal + 1.0`, unlike
 *      `create-var`'s initializer or `return`'s expression, neither of which go through
 *      `emitAssignment` at all) has no DSL-stated target type available to cast against at that point
 *      in the compiler. C#'s own numeric-literal/promotion rules make this matter here specifically:
 *      an unsuffixed decimal literal like `1.0` is always `double` (never `float`), so
 *      `pointsTotal + 1.0` is `float + double`, which promotes to `double` — reassigning that back
 *      into a `float`-declared `pointsTotal` would then be a *narrowing* conversion C# never performs
 *      implicitly (`error CS0266`), unlike C++, which narrows silently.
 *   Once every one of these variables is `float64`, `create-var`'s own value expression — which,
 *   unlike C#'s `toSharpTypedValue`, is emitted as-is with no cast on the cpp/Go/Rust targets — always
 *   already matches its declared type too (`pi`'s own initializer mixes `pointsTotal`/`pointsInside`,
 *   both `float64`; making `pi` anything other than `float64` would have reintroduced gap 2's own
 *   cross-type mismatch one variable later). The function's own return type is `float64` for the same
 *   reason (`return pi;`, no per-target return-cast mechanism outside C#'s either).
 * - Every numeric literal that ends up in a float-typed spot is spelled with an explicit `.0` (`5.0`,
 *   `0.0`, `1.0`, `2.0`, `4.0`), not the bare integer the old fixture used — a real,
 *   previously-undiscovered Rust-specific gap this migration found: unlike every other target
 *   (confirmed empirically — Go's own `var r float64 = 5` compiles fine, matching the already-known
 *   "Go's untyped constants are kind-flexible" behavior from the `from-to-cycle` bound fix in the Go
 *   implementation notes), Rust's integer-literal *token* and float-literal *token* are fundamentally
 *   different kinds at the syntax level — `5` can only ever resolve to an integer type, `5.0` only to
 *   a float type, with no implicit conversion between them regardless of the context's expected type.
 *   `rustc`'s own diagnostic for `let r: f64 = 5;` literally suggests this exact fix ("use a
 *   floating-point literal by writing it with `.0`"). Fixed at the fixture level rather than in
 *   `rust-adapter.ts`'s `formatNumericLiteral`, which has no access to the DSL's own int/float
 *   distinction in the first place — `walk-expression.ts` only ever hands it the literal's source
 *   text, and TypeScript's own type system doesn't distinguish `number` subtypes the way
 *   `TVariableInfo` does, so there's no type information upstream to decide this from even if the
 *   signature grew a type parameter. Since `.0` is valid, unremarkable TypeScript with identical
 *   runtime meaning to the bare integer, this isn't a workaround so much as the more honest spelling
 *   for a value that was always conceptually a float (a radius of `5.0`, not `5`).
 * - `from-to-cycle` is inclusive of `to` here (`item <= to`), exclusive in the old app — same
 *   already-documented difference every prior migrated project accounts for. `roundsTotal` itself keeps
 *   the old fixture's literal value (`10000000`); the loop's own `to` expression is `roundsTotal - 1`
 *   instead of a second literal, so both the round count and the "why minus one" stay visible together.
 * - `main`'s old `"!!test started"` log line is dropped, same reasoning as every prior migrated project.
 * - The old fixture's final `assign_var: returnValue = pi` plus an argument-less `return` is collapsed
 *   into a direct `return pi`, matching this compiler's own `return`-takes-an-expression convention
 *   (same simplification `conditions`'s `TestReturn` migration already established).
 */

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const float64Type: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float64' } };

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

const createVar = (id: string, name: string, variableType: TVariableInfo, value: string): INode => ({
  id,
  name: 'create-var',
  data: { name, variableType, value },
});

const action = (id: string, statement: string): INode => ({ id, name: 'action', data: statement });

const log = (id: string, message: string): INode => ({ id, name: 'log', data: message });

const returnStatement = (id: string, expression: string): INode => ({ id, name: 'return', data: expression });

const callFunction = (id: string, schemeId: string, returnVariable: string): INode => ({
  id,
  name: 'call-function',
  data: { schemeId, parameters: [], returnVariable },
});

interface IIfBranch {
  readonly children?: readonly INode[];
}

const ifBranch = (id: string, branch: IIfBranch): INode => ({
  id,
  name: 'if-child',
  ...(branch.children ? { children: branch.children } : {}),
});

/** Only a `thenBranch` — the old fixture's `if` has an empty `else` too (see the old `.falang.json`), which compiles to nothing either way. */
const ifNode = (id: string, condition: string, thenBranch: IIfBranch): INode => ({
  id,
  name: 'if',
  data: condition,
  children: [ifBranch(`${id}-then`, thenBranch), ifBranch(`${id}-else`, {})],
});

/** `to` is already the inclusive-bound expression — see this file's own top comment. */
const fromToCycle = (id: string, from: string, to: string, item: string, children: readonly INode[]): INode => ({
  id,
  name: 'from-to-cycle',
  data: { from, to, item },
  children,
});

const DOC = {
  calc: 'doc-calculate-montecarlo',
  main: 'doc-main',
} as const;

export const MAIN_DOCUMENT_ID = DOC.main;

export const MONTECARLO_PROJECT_DOCUMENTS: readonly IProjectDocument[] = [
  functionDocument(
    DOC.calc,
    'calculateMonteCarlo',
    [
      createVar('cv-roundsTotal', 'roundsTotal', int32Type, '10000000'),
      createVar('cv-r', 'r', float64Type, '5.0'),
      createVar('cv-r2', 'r2', float64Type, 'r * r'),
      createVar('cv-pointsTotal', 'pointsTotal', float64Type, '0.0'),
      createVar('cv-pointsInside', 'pointsInside', float64Type, '0.0'),
      fromToCycle('loop', '0', 'roundsTotal - 1', 'i', [
        action('a-pointsTotal', 'pointsTotal = pointsTotal + 1.0'),
        createVar('cv-y', 'y', float64Type, 'Math.random() * r * 2.0 - r'),
        createVar('cv-x', 'x', float64Type, 'Math.random() * r * 2.0 - r'),
        createVar('cv-currentR2', 'currentR2', float64Type, 'x * x + y * y'),
        ifNode('if-inside', 'currentR2 < r2', {
          children: [action('a-pointsInside', 'pointsInside = pointsInside + 1.0')],
        }),
      ]),
      createVar('cv-pi', 'pi', float64Type, '4.0 * pointsInside / pointsTotal'),
      returnStatement('ret-pi', 'pi'),
    ],
    float64Type,
  ),
  functionDocument(DOC.main, 'main', [
    callFunction('c-calc', DOC.calc, 'resultPi'),
    log('l-result', 'Calculation result: ${resultPi}'),
  ]),
];
