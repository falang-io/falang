import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileSharpStatementList } from './compile-sharp-statements.js';
import type { ISharpCompileParams } from './sharp-statement-context.js';
import { computeCycleInfo, type ICycleInfo } from './cycle-info.js';
import { NodeCompileError } from './node-compile-error.js';
import { variableInfoToSharpType } from './sharp-type-name.js';
import { indentLines } from './indent.js';
import { getFunctionSignature, type IFunctionBodyParameter } from './function-signature.js';

/** Declares only the bookkeeping variables this function's body actually uses (see `computeCycleInfo`) — same guards old `sharpLogicIconsBuilder.ts`'s own `function` builder had (`short _break_level`/`short _continue_level`/`bool _switch_break`; widened to `int` here, matching the cpp target, since nothing depends on the narrower type). */
const buildCycleBookkeepingDeclarations = (cycleInfo: ICycleInfo): string[] => {
  const declarations: string[] = [];
  if (cycleInfo.hasBreaks) declarations.push('int _break_level = 0;');
  if (cycleInfo.hasContinues) declarations.push('int _continue_level = 0;');
  if (cycleInfo.hasSwitchBreaks) declarations.push('bool _switch_break = false;');
  return declarations;
};

/**
 * Builds a `public static <returnType> <name>(<params>)` header. Every compiled function is a static
 * method of the single generated `Program` class (see `compile-sharp-project.ts`) — C# has no
 * free-standing functions, but it also resolves members regardless of declaration order, so (like Go
 * and Rust, unlike C++) there's no forward-declaration counterpart to this.
 */
export const buildSharpSignatureLine = (
  sharpName: string,
  parameters: readonly IFunctionBodyParameter[],
  returnValue: TVariableInfo | undefined,
  structNames: ReadonlyMap<string, string>,
): string => {
  const sharpParams = parameters
    .map((parameter) => `${variableInfoToSharpType(parameter.type, structNames)} ${parameter.name}`)
    .join(', ');
  const returnType = returnValue ? variableInfoToSharpType(returnValue, structNames) : 'void';
  return `public static ${returnType} ${sharpName}(${sharpParams})`;
};

/**
 * C#, like Go and Rust (and unlike C++, which merely leaves it undefined at runtime), statically
 * rejects a non-`void` method whose body can fall off the end — "not all code paths return a value"
 * (CS0161). Same fix as those two targets: an unconditional `throw` after the compiled body whenever
 * the DSL's own last top-level body node isn't already a `return`/`throw` (a `throw` statement
 * terminates a code path for CS0161's purposes, exactly as `panic`/`panic!` do for Go/Rust). The check
 * is structural (the last body *node*, not the generated text) and conservative — this compiler does
 * not reimplement C#'s own reachability analysis, it just always adds the line when the last node
 * isn't obviously terminating, which at worst costs one unreachable statement.
 */
const NON_TERMINATING_LEAF_NAMES = new Set(['return', 'throw']);

const needsTrailingThrow = (bodyNodes: readonly INode[], returnValue: TVariableInfo | undefined): boolean => {
  if (!returnValue) return false;
  const lastNode = bodyNodes.at(-1);
  return !lastNode || !NON_TERMINATING_LEAF_NAMES.has(lastNode.name);
};

/** Compiles one `function` document's root node into a single C# static method — the C#-target analogue of `compileCppFunction`. */
export const compileSharpFunction = (functionNode: INode, sharpName: string, params: ISharpCompileParams): string => {
  const [, body] = functionNode.children ?? [];
  if (!body) {
    throw new NodeCompileError(
      functionNode.id,
      `Function node "${functionNode.id}" is missing its function-body child`,
    );
  }
  const { parameters, returnValue } = getFunctionSignature(functionNode);
  const signatureLine = buildSharpSignatureLine(sharpName, parameters, returnValue, params.structNames);

  const parameterScope: Record<string, TVariableInfo> = {};
  for (const parameter of parameters) parameterScope[parameter.name] = parameter.type;

  const bodyNodes = body.children ?? [];
  const cycleInfo = computeCycleInfo(bodyNodes);
  const bookkeeping = buildCycleBookkeepingDeclarations(cycleInfo);
  const statements = compileSharpStatementList(bodyNodes, {
    scope: parameterScope,
    nesting: [],
    cycleInfo,
    returnValue,
    params,
  });
  const trailingThrow = needsTrailingThrow(bodyNodes, returnValue) ? ['throw new Exception("unreachable");'] : [];

  const bodyCode = [...bookkeeping, statements, ...trailingThrow].filter((line) => line !== '').join('\n');
  return `${signatureLine} {\n${indentLines(bodyCode)}\n}`;
};
