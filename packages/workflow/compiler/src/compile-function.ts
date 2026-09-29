import type { INode } from '@falang/dto';
import { getContainerScopeContribution } from '@falang/typescript-common';
import { variableInfoToTsType, type TVariableInfo } from '@falang/typescript-dto';
import { DEBUG_ENTER_CALL, DEBUG_LEAVE_CALL } from './debug-runtime.js';
import { indentLines } from './indent.js';
import { NodeCompileError } from './node-compile-error.js';
import { asComment, asStatement } from './raw-code.js';
import {
  compileStatements,
  type IDebugEmitOptions,
  type TIntegrationEmitters,
  type TQuestionEmitters,
  type TResolveFunctionName,
} from './node-emitters.js';
import { POSITION_ENTER_FN, POSITION_FAILURE_FN, POSITION_LEAVE_FN } from './position-runtime.js';

export interface ITrackPositionOptions {
  /** The document this function was compiled from — recorded as the frame's `documentId`, see `position-runtime.ts`. */
  readonly documentId: string;
}

/**
 * Wraps a compiled function body so the position runtime (see `position-runtime.ts`) knows when
 * the function is entered/left and can attach the last position to an escaping error. Shared by
 * `compileFunction` and `compileTriggerFunction`.
 */
export const wrapBodyWithPositionTracking = (bodyCode: string, { documentId }: ITrackPositionOptions): string =>
  [
    `${POSITION_ENTER_FN}(${JSON.stringify(documentId)});`,
    'try {',
    indentLines(bodyCode),
    '} catch (error) {',
    `  throw ${POSITION_FAILURE_FN}(error);`,
    '} finally {',
    `  ${POSITION_LEAVE_FN}();`,
    '}',
  ].join('\n');

/**
 * Wraps a compiled function body so the debug runtime (see `debug-runtime.ts`) knows when the
 * function is entered/left — call depth is what "step over" is defined against. Applied outside
 * `wrapBodyWithPositionTracking` when both are on; the two wraps are independent (see
 * `debug-runtime.ts`'s file comment for why depth isn't shared with the position runtime's stack).
 */
export const wrapBodyWithDebugTracking = (bodyCode: string): string =>
  [`${DEBUG_ENTER_CALL}();`, 'try {', indentLines(bodyCode), '} finally {', `  ${DEBUG_LEAVE_CALL}();`, '}'].join('\n');

export interface IFunctionBodyParameter {
  readonly name: string;
  readonly type: TVariableInfo;
}

interface IFunctionBodyData {
  readonly parameters: readonly IFunctionBodyParameter[];
  readonly returnValue?: TVariableInfo;
}

export interface IFunctionSignature {
  readonly parameters: readonly IFunctionBodyParameter[];
  readonly returnValue?: TVariableInfo;
}

/**
 * Reads a `function` node's declared parameters and return type (see `functionCfg` in
 * `@falang/dto`) without compiling its body — used by `compileFunction` itself, and by
 * `@falang/workflow-backend` to describe a project's runnable functions (e.g. for a manual-run
 * form) without paying for a full compile.
 */
export const getFunctionSignature = (functionNode: INode): IFunctionSignature => {
  const [, body] = functionNode.children ?? [];
  if (!body) {
    throw new NodeCompileError(
      functionNode.id,
      `Function node "${functionNode.id}" is missing its function-body child`,
    );
  }
  const bodyData = body.data as IFunctionBodyData;
  return { parameters: bodyData.parameters, returnValue: bodyData.returnValue };
};

export interface ICompileFunctionOptions {
  /** Resolves `call-function` targets to compiled function names; see `compileProject`. */
  readonly resolveFunctionName?: TResolveFunctionName;
  /** Handles any registered vendor's action node kinds (e.g. `telegram-send-message`) appearing in the body; see `compileProject`. */
  readonly integrationEmitters?: TIntegrationEmitters;
  /** Handles any registered vendor's question-with-buttons node kinds (e.g. `telegram-question`) appearing in the body; see `compileProject`. */
  readonly questionEmitters?: TQuestionEmitters;
  /** Instruments the body for live execution-position tracking — see `position-runtime.ts`. Off unless set. */
  readonly trackPosition?: ITrackPositionOptions;
  /** Instruments the body for breakpoint debugging — see `debug-runtime.ts`. Off unless set. */
  readonly debug?: IDebugEmitOptions;
}

/** The local `@falang/typescript-common` reports for a non-void `function-body` (auto-declared and returned
 *  by `@falang/logic-constructor`'s TS/Rust targets, so the editor knows about it). This compiler never
 *  declares it, so a debug trace must not capture it — `() => ({ returnValue })` failed type-checking for
 *  every function with a return type once `collectScopeVariables` started reporting it (2026-09-21). */
const AUTO_RETURN_VALUE_NAME = 'returnValue';

const debugCapturedBodyScope = (body: INode) =>
  getContainerScopeContribution(body).filter(
    (variable) => !(variable.name === AUTO_RETURN_VALUE_NAME && variable.type.constant === false),
  );

/**
 * Compiles one workflow document — a `function` node (header/body/footer, see `functionCfg` in
 * `@falang/dto`) — into a single async TypeScript function declaration. Temporal only requires a
 * plain top-level exported async function to use as a workflow entry point, so no further
 * wrapping is needed until activity/signal/timer-backed node kinds exist (see
 * ADR 0001 (private)).
 */
export const compileFunction = (functionNode: INode, name: string, options: ICompileFunctionOptions = {}): string => {
  const [header, body, footer] = functionNode.children ?? [];
  if (!body) {
    throw new NodeCompileError(
      functionNode.id,
      `Function node "${functionNode.id}" is missing its function-body child`,
    );
  }

  const { parameters, returnValue } = getFunctionSignature(functionNode);
  const params = parameters.map((param) => `${param.name}: ${variableInfoToTsType(param.type)}`).join(', ');
  const returnType = returnValue ? variableInfoToTsType(returnValue) : 'void';

  const headerComment = asComment(header?.data as string | undefined);
  const statements = compileStatements(
    body.children ?? [],
    options.resolveFunctionName,
    options.integrationEmitters,
    options.questionEmitters,
    Boolean(options.trackPosition),
    options.debug,
    options.debug ? debugCapturedBodyScope(body) : [],
  );
  const footerCode = asStatement(footer?.data as string | undefined);

  const plainBody = [statements, footerCode].filter((line) => line !== '').join('\n');
  const positionWrappedBody = options.trackPosition
    ? wrapBodyWithPositionTracking(plainBody, options.trackPosition)
    : plainBody;
  const bodyCode = options.debug ? wrapBodyWithDebugTracking(positionWrappedBody) : positionWrappedBody;
  const declaration = `export async function ${name}(${params}): Promise<${returnType}> {\n${indentLines(bodyCode)}\n}`;
  return headerComment === '' ? declaration : `${headerComment}\n${declaration}`;
};
