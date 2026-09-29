import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import {
  compileStatementList,
  computeCycleInfo,
  type ICppCompileParams,
  type IDebugCompileOptions,
} from './compile-cpp-statements.js';
import { NodeCompileError } from './node-compile-error.js';
import { variableInfoToCppType } from './cpp-type-name.js';
import { getFunctionSignature, type IFunctionBodyParameter } from './function-signature.js';

/** Declares the bookkeeping variables the multi-level break/continue mechanism needs — only the ones this function's body actually uses (see `computeCycleInfo`), matching old cpp/js/ts/sharp/golang/rust codegen's own `if (builder.cycleCompileInfo.hasBreaks) { ... }` guards. */
const buildCycleBookkeepingDeclarations = (cycleInfo: ReturnType<typeof computeCycleInfo>): string[] => {
  const declarations: string[] = [];
  if (cycleInfo.hasBreaks) declarations.push('int _break_level = 0;');
  if (cycleInfo.hasContinues) declarations.push('int _continue_level = 0;');
  if (cycleInfo.hasSwitchBreaks) declarations.push('bool _switch_break = false;');
  return declarations;
};

/** Builds a signature's `<returnType> <cppName>(<params>)` text — shared by `compileCppFunction`'s own definition line and `compile-cpp-project.ts`'s forward declarations (C++, unlike TS, has no hoisting: a function called before its own definition appears later in the file needs a prototype declared above the call site). */
export const buildCppSignatureLine = (
  cppName: string,
  parameters: readonly IFunctionBodyParameter[],
  returnValue: TVariableInfo | undefined,
  structNames: ReadonlyMap<string, string>,
): string => {
  const cppParams = parameters
    .map((parameter) => `${variableInfoToCppType(parameter.type, structNames)} ${parameter.name}`)
    .join(', ');
  const returnType = returnValue ? variableInfoToCppType(returnValue, structNames) : 'void';
  return `${returnType} ${cppName}(${cppParams})`;
};

/**
 * Compiles one `function` document's root node (header/body/footer, see `functionCfg` in
 * `@falang/dto`) into a single C++ function definition — the cpp-target analogue of
 * `@falang/workflow-compiler`'s `compileFunction`. `debug`, if given, brackets the body with the
 * tracer's `emitEnter`/`emitLeave` (call-depth tracking, see `ITraceEmitter`) and threads through to
 * every statement via `ICppStatementContext.debug` — omitted, the output is byte-identical to before
 * this parameter existed.
 */
export const compileCppFunction = (
  functionNode: INode,
  cppName: string,
  params: ICppCompileParams,
  debug?: IDebugCompileOptions,
): string => {
  const [, body] = functionNode.children ?? [];
  if (!body) {
    throw new NodeCompileError(
      functionNode.id,
      `Function node "${functionNode.id}" is missing its function-body child`,
    );
  }
  const { parameters, returnValue } = getFunctionSignature(functionNode);
  const signatureLine = buildCppSignatureLine(cppName, parameters, returnValue, params.structNames);

  const parameterScope: Record<string, TVariableInfo> = {};
  for (const parameter of parameters) parameterScope[parameter.name] = parameter.type;

  const bodyNodes = body.children ?? [];
  const cycleInfo = computeCycleInfo(bodyNodes);
  const bookkeeping = buildCycleBookkeepingDeclarations(cycleInfo);
  const statements = compileStatementList(bodyNodes, {
    scope: parameterScope,
    nesting: [],
    cycleInfo,
    params,
    debug,
  });
  const enterLine = debug ? debug.tracer.emitEnter() : '';
  const leaveLine = debug ? debug.tracer.emitLeave() : '';

  const bodyCode = [...bookkeeping, enterLine, statements, leaveLine].filter((line) => line !== '').join('\n');
  return `${signatureLine} {\n${bodyCode
    .split('\n')
    .map((line) => (line === '' ? line : `  ${line}`))
    .join('\n')}\n}`;
};
