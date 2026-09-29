import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { NodeCompileError } from './node-compile-error.js';

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
 * Reads a `function` node's declared parameters/return type without compiling its body —
 * language-agnostic (the `function`/`function-body` node shape itself doesn't vary by target
 * language), shared by every statement-level target's own `compile-<lang>-function.ts`.
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
