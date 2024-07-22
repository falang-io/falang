import { TContext, TTypeInfo } from '../constants'
import { Expression2Store } from '../expression/Expression2.store'
import { LogicProjectStore } from '../LogicProject.store'
import { validateName } from './validateName'
import { validateNode } from './validateNode'

export interface IValidateExpressionParams {
  store: Expression2Store
  context: TContext
  typeInfo: TTypeInfo
  projectStore: LogicProjectStore,
}

export const validateExpression2 = ({ store, context, projectStore, typeInfo }: IValidateExpressionParams): string[] => {
  const returnValue: string[] = store.errors;
  const node = store.mathNode;
  if(!node) return returnValue;
  const expr = node.toString();
  if (expr.trim().length === 0) {
    returnValue.push('_{logic:empty_expression}');
    return returnValue;
  }
  try {
    validateNode({ node: node, context, typeInfo, projectStore });
  } catch (err) {
    returnValue.push(err instanceof Error ? err.message : 'Unknown error');
  }
  return returnValue;
}

export interface IValidateExpressionNameParams {
  allowEmpty?: boolean
  store: Expression2Store
  context: TContext
}

export const validateExpression2Name = ({ store, context, allowEmpty }: IValidateExpressionNameParams): string[] => {
  const returnValue: string[] = store.errors;
  const expression = store.expression;
  if (expression.trim().length === 0 && !allowEmpty) {
    returnValue.push('_{logic:empty_expression}');
    return returnValue;
  }
  const node = store.mathNode;
  if(!node) return returnValue;
  const returnName = node.toString();
  if (!validateName(returnName)) {
    returnValue.push(`_{logic:wrong_name}: ${returnName}`);
  } else if(returnName in context) {
    returnValue.push(`_{logic:variable_already_exists}: ${returnName}`);
  }
  return returnValue;
};
