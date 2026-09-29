import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileTsStatementList } from './compile-ts-statements.js';
import type { ITsCompileParams } from './ts-statement-context.js';
import { NodeCompileError } from './node-compile-error.js';
import { emitTsEmptyValue, tsReturnTypeName, variableInfoToTsTypeName } from './ts-type-name.js';
import { indentLines } from './indent.js';
import { getFunctionSignature, type IFunctionBodyParameter } from './function-signature.js';

/**
 * The auto-managed local a non-void function's body mutates instead of always returning explicitly —
 * ported from the old app's own convention (its own generated `getNextPoint.ts` never has an explicit
 * `return` at all, only `returnValue.x = ...`/`returnValue.y = ...` assignments — see
 * ADR 0019 (private)'s "TypeScript target" implementation notes). Declared with a fully-populated
 * empty value (`ts-type-name.ts`'s `emitTsEmptyValue`) up front and unconditionally returned at the very
 * end of the compiled body (`buildTrailingReturn` below) — this coexists with an explicit `return <expr>`
 * DSL node mid-body (`isGameOver`'s own early returns compile normally through `ts-leaf-emitters.ts`'s
 * `emitReturn`), since a `return` earlier in the body simply exits before the trailing
 * `return returnValue;` is ever reached — TS never reports that as an error (dead code past a `return`
 * is at most a suggestion-level IDE hint, never a `tsc` diagnostic under default settings).
 */
const RETURN_VALUE_NAME = 'returnValue';

/** Struct/array parameters get a full deep copy on entry (`JSON.parse(JSON.stringify(...))`), matching the reference `code/ts` output's own `let state: GameState = JSON.parse(JSON.stringify(_params.state));` — scalars are already value types in JS/TS and need no copy. */
const needsDeepCopy = (type: TVariableInfo): boolean => type.type === 'struct' || type.type === 'array';

const buildParamsInterface = (
  tsName: string,
  parameters: readonly IFunctionBodyParameter[],
  structNames: ReadonlyMap<string, string>,
): string => {
  const fields = [
    ...parameters.map((parameter) => `  ${parameter.name}: ${variableInfoToTsTypeName(parameter.type, structNames)};`),
    '  _falangGlobal: FalangGlobal;',
  ];
  return `export interface I${tsName}Params {\n${fields.join('\n')}\n}`;
};

const buildParamBindings = (
  parameters: readonly IFunctionBodyParameter[],
  structNames: ReadonlyMap<string, string>,
): string[] =>
  parameters.map((parameter) => {
    const tsType = variableInfoToTsTypeName(parameter.type, structNames);
    const source = `_params.${parameter.name}`;
    const value = needsDeepCopy(parameter.type) ? `JSON.parse(JSON.stringify(${source}))` : source;
    return `let ${parameter.name}: ${tsType} = ${value};`;
  });

/**
 * Compiles one `function` document's root node into a single, self-contained TS function definition
 * (its own `I<DocName>Params` interface plus the `async function` itself, Contract 4) — the TS-target
 * analogue of `compile-go-function.ts`'s `compileGoFunction`. Doesn't build the file's own `import`
 * lines (unlike a single-translation-unit target, a multi-file target's imports depend on what every
 * *other* document declares, so `compile-ts-project.ts` builds them once, after compiling every
 * function, by scanning the generated text — see its own doc comment).
 */
export const compileTsFunction = (functionNode: INode, tsName: string, params: ITsCompileParams): string => {
  const [, body] = functionNode.children ?? [];
  if (!body) {
    throw new NodeCompileError(
      functionNode.id,
      `Function node "${functionNode.id}" is missing its function-body child`,
    );
  }
  const { parameters, returnValue } = getFunctionSignature(functionNode);
  const paramsInterface = buildParamsInterface(tsName, parameters, params.structNames);
  const paramBindings = buildParamBindings(parameters, params.structNames);

  const scope: Record<string, TVariableInfo> = {};
  for (const parameter of parameters) scope[parameter.name] = parameter.type;

  let returnValueDeclaration: readonly string[] = [];
  if (returnValue && returnValue.type !== 'void') {
    scope[RETURN_VALUE_NAME] = returnValue;
    const tsType = variableInfoToTsTypeName(returnValue, params.structNames);
    const emptyValue = emitTsEmptyValue(returnValue, params.structDefinitions, functionNode.id);
    returnValueDeclaration = [`let ${RETURN_VALUE_NAME}: ${tsType} = ${emptyValue};`];
  }
  const hasReturnValue = returnValueDeclaration.length > 0;

  const bodyNodes = body.children ?? [];
  const statements = compileTsStatementList(bodyNodes, {
    scope,
    loopLabels: [],
    usedLabels: new Set(),
    counter: { value: 0 },
    params,
  });

  const trailingReturn = hasReturnValue ? [`return ${RETURN_VALUE_NAME};`] : [];

  const bodyLines = [
    'const _falangGlobal = _params._falangGlobal;',
    ...paramBindings,
    ...returnValueDeclaration,
    statements,
    ...trailingReturn,
  ].filter((line) => line !== '');
  const bodyCode = bodyLines.join('\n');

  const signatureLine = `export async function ${tsName}(_params: I${tsName}Params): ${tsReturnTypeName(returnValue, params.structNames)}`;

  return `${paramsInterface}\n${signatureLine} {\n${indentLines(bodyCode)}\n}`;
};
