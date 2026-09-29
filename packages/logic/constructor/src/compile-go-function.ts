import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileGoStatementList } from './compile-go-statements.js';
import type { IGoCompileParams } from './go-statement-context.js';
import { NodeCompileError } from './node-compile-error.js';
import { variableInfoToGoType } from './golang-type-name.js';
import { indentLines } from './indent.js';
import { getFunctionSignature, type IFunctionBodyParameter } from './function-signature.js';

/**
 * Builds a `func <goName>(<params>) <returnType> {` header — unlike `buildCppSignatureLine`, this has
 * no forward-declaration counterpart: Go resolves every package-level function call regardless of
 * textual order, so `compile-go-project.ts` never needs a prototypes pass the way the cpp target
 * does. A `void`-returning function simply omits the return type entirely (Go has no `void` keyword).
 */
export const buildGoSignatureLine = (
  goName: string,
  parameters: readonly IFunctionBodyParameter[],
  returnValue: TVariableInfo | undefined,
  structNames: ReadonlyMap<string, string>,
): string => {
  const goParams = parameters
    .map((parameter) => `${parameter.name} ${variableInfoToGoType(parameter.type, structNames)}`)
    .join(', ');
  const returnType = returnValue ? ` ${variableInfoToGoType(returnValue, structNames)}` : '';
  return `func ${goName}(${goParams})${returnType}`;
};

/**
 * Go statically requires a non-`void` function's body to end in a "terminating statement" (spec term —
 * `return`, an infinite `for` with no `break`, an `if`/`switch` where every branch itself terminates,
 * …) — unlike C++, which has no such compile-time check at all (a C++ function that falls off the end
 * without returning is merely undefined behavior at runtime, not a build error). A real gap found only
 * by actually running the compiled Go, not by unit tests: `conditions`' `TestReturn` is a "search a
 * bounded range, return once found" pattern whose last top-level statement is a `from-to-cycle`, not a
 * `return` — provably always hit before falling through, by the DSL author's own logic, but Go's
 * syntactic check can't see that and rejects it ("missing return"). Appending an unconditional
 * `panic("unreachable")` after the compiled body is a real, standard Go idiom for exactly this
 * situation (a `panic` call is itself a terminating statement per the Go spec, so it always satisfies
 * the check) rather than reimplementing Go's own terminating-statement analysis to decide whether one
 * is truly needed — skipped only when the body's very last top-level node is already `return`/`throw`,
 * so an already-correct function doesn't grow unreachable dead code for no reason.
 */
const NON_TERMINATING_LEAF_NAMES = new Set(['return', 'throw']);

const needsTrailingPanic = (bodyNodes: readonly INode[], returnValue: TVariableInfo | undefined): boolean => {
  if (!returnValue) return false;
  const lastNode = bodyNodes.at(-1);
  return !lastNode || !NON_TERMINATING_LEAF_NAMES.has(lastNode.name);
};

/**
 * Compiles one `function` document's root node into a single Go function definition — the Go-target
 * analogue of `compile-cpp-function.ts`'s `compileCppFunction`. Simpler than that function in one
 * real way: no cycle-bookkeeping declarations to compute/prepend, since Go's labeled break/continue
 * needs none (see `go-statement-context.ts`).
 */
export const compileGoFunction = (functionNode: INode, goName: string, params: IGoCompileParams): string => {
  const [, body] = functionNode.children ?? [];
  if (!body) {
    throw new NodeCompileError(
      functionNode.id,
      `Function node "${functionNode.id}" is missing its function-body child`,
    );
  }
  const { parameters, returnValue } = getFunctionSignature(functionNode);
  const signatureLine = buildGoSignatureLine(goName, parameters, returnValue, params.structNames);

  const parameterScope: Record<string, TVariableInfo> = {};
  for (const parameter of parameters) parameterScope[parameter.name] = parameter.type;

  const bodyNodes = body.children ?? [];
  const statements = compileGoStatementList(bodyNodes, {
    scope: parameterScope,
    returnValue,
    loopLabels: [],
    usedLabels: new Set(),
    labelCounter: { value: 0 },
    params,
  });
  const bodyCode = needsTrailingPanic(bodyNodes, returnValue) ? `${statements}\npanic("unreachable");` : statements;

  return `${signatureLine} {\n${indentLines(bodyCode)}\n}`;
};
