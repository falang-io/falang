export const MathNodeTypes = ['value', 'var', 'func'] as const;
export type TMathNodeType = typeof MathNodeTypes[number];

export const MathExpressionTypes = ['add', 'subtract', 'div', 'multi'] as const;
export type TMathExpressionType = typeof MathExpressionTypes[number];

export interface IMathExpression {
  type: TMathExpressionType
  nodes: TMathNode
}

export interface IMathNodeBase {
  type: TMathNodeType
}

export interface IMathNodeValue extends IMathNodeBase {
  type: 'value'
  value: string
}

export interface IMathNodeVar extends IMathNodeBase {
  type: 'var'
  variable: string
}

export interface IMathNodeFunc extends IMathNodeBase {
  type: 'func'
  function: string
  parameters: TMathNode[]
}

export type TMathNode = IMathNodeValue | IMathNodeVar | IMathNodeFunc;

export interface MathExpression {

}