import math from 'mathjs';
import { IExpressionFunctionData, IExpressionFunctionSignature, TContext, TTypeInfo } from '../constants';
import { LogicProjectStore } from '../LogicProject.store';
import { getNodeReturnType } from './getNodeReturnType';
import { compareTypes } from './validateNode';

export interface IFindSignatureParams {
  functionData: IExpressionFunctionData;
  args: math.MathNode[];
  context: TContext;
  projectStore: LogicProjectStore
}

export const findSignature = ({ functionData, args, context, projectStore }: IFindSignatureParams): IExpressionFunctionSignature | null => {
  const argsTypes = args.map((arg) => getNodeReturnType({ node: arg, context, projectStore }));
  for (const signature of functionData.signatures) {
    if (signature.parameters.length !== argsTypes.length) continue;
    try {
      for (let i = 0; i < signature.parameters.length; i++) {
        const p = signature.parameters[i];
        const arg = argsTypes[i];
        compareTypes(arg, p);
      }
      return signature;
    } catch (err) { }
  }
  return null;
}
