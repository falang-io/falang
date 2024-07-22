import * as math from 'mathjs';
import { computed, makeObservable, runInAction } from 'mobx';
import { SchemeStore } from '@falang/editor-scheme';
import { PositionStore } from '@falang/editor-scheme';
import { ShapeStore } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { Code2Store } from '@falang/infrastructure-code';
import { FC } from 'react';
import { Expression2BackgroundComponent, Expression2EditorComponent, Expression2ViewComponent } from '../cmp/Expression2.cmp';
import { TContext, TExpressionType, TVariableInfo } from '../constants';
import { getAccessorNodeType, validateNode, validateScalarNode } from '../util/validateNode';
import { LogicProjectStore } from '../LogicProject.store';

export interface IExpression2StoreParams {
  scheme: SchemeStore,
  expression: string,
  minHeight?: number,
  singleLine?: boolean,
  type: TExpressionType,
  getVariableType?: () => TVariableInfo | null
  getContext?: () => TContext,
  projectStore: LogicProjectStore,
}

export class Expression2Store implements IBlockInBlock<Expression2Store> {
  readonly scheme: SchemeStore;
  readonly codeStore: Code2Store;
  readonly shape: ShapeStore;
  readonly position: PositionStore;
  readonly type: TExpressionType;
  readonly projectStore: LogicProjectStore;
  private readonly getVariableType: () => TVariableInfo | null
  private readonly getContext: () => TContext

  constructor(params: IExpression2StoreParams) {
    this.codeStore = new Code2Store({
      ...params,
      code: params.expression,
      language: 'js',
      minHeight: params.minHeight,
    });
    this.scheme = params.scheme;
    this.type = params.type;
    this.shape = this.codeStore.shape;
    this.position = this.codeStore.position;
    this.getVariableType = params.getVariableType ?? (() => null);
    this.getContext = params.getContext ?? (() => { return {}});
    this.projectStore = params.projectStore;
    makeObservable(this);
  }

  @computed get height() {
    return this.codeStore.shape.height;
  }

  get expression() {
    return this.codeStore.code;
  }

  get context() {
    return this.getContext();
  }

  setExpression(expression: string) {
    this.codeStore.setCode(expression);
  }

  get variableType() {
    return this.getVariableType();
  }

  @computed private get _mathNode(): math.MathNode | string {
    try {
      const returnValue = math.parse(this.expression);
      return returnValue;
    } catch (err) {
      return err instanceof Error ? err.message : JSON.stringify(err);
    }    
  }

  @computed get mathNode(): math.MathNode | null {
    const node = this._mathNode;
    if(typeof node === 'string') return null;
    return node;
  }

  @computed get isAssigment(): boolean {
    return math.isAssignmentNode(this.mathNode);
  }

  @computed get variableToSet(): string | null {
    const node = this.mathNode;
    if(!math.isAssignmentNode(node)) {
      return null;
    }
    return node.object.name;
  }

  @computed get errors(): string[] {
    const node = this._mathNode;
    if(typeof node === 'string') return [node];
    return [];
  }

  

  dispose() {
    this.codeStore.dispose();
  }

  getBackground(): FC<{ store: Expression2Store; }> {
    return Expression2BackgroundComponent;
  }

  getEditor(): FC<{ store: Expression2Store; }> {
    return Expression2EditorComponent;
  }

  getErrors(): string[] {
    return this.errors;
  }

  getRenderer(): FC<{ store: Expression2Store; }> {
    return Expression2ViewComponent;
  }


  @computed get variableName(): string | null {
    const node = this.mathNode;
    if (!math.isAssignmentNode(node)) {
      return null;
    }
    return node.object.name;
  }

  protected validateExpression() {
    const node = this.mathNode;
    const variableName = this.variableName;
    const variableType = this.variableType;
    const context = this.context;
    if (!node) throw new Error('Wrong node');
    switch (this.type) {
      case 'create':
        if (!variableName) throw new Error('_{logic:wrong_assign}');
        if (variableName in context) throw new Error(`_{logic:variable_already_exists}: ${variableName}`);
        if (!math.isAssignmentNode(node)) throw new Error('_{logic:wrong_assign}');
        if (!variableType) throw new Error('No variable type');
        validateNode({ node: node.value, context, typeInfo: variableType, projectStore: this.projectStore });
        break;
      case 'assign':
        if (!variableName) throw new Error('_{logic:wrong_assign}');
        if(!context[variableName]) throw new Error(`_{logic:variable_not_found}: ${variableName}`);
        if (context[variableName].constant) {
          throw new Error(`_{logic:variable_is_constant}: ${variableName}`);
        }
        if (!math.isAssignmentNode(node)) throw new Error('_{logic:wrong_assign}');
        if(node.index) {
          const typ = getAccessorNodeType(node, context, this.projectStore);
          validateNode({ node: node.value, context, typeInfo: typ, projectStore: this.projectStore });
        }
        else if (math.isSymbolNode(node.object)) {
          const name = node.object.name;
          const typ = context[name];
          if (!typ) {
            throw new Error(`_{logic:variable_not_found}: ${variableName}`);
          }
          validateNode({ node: node.value, context, typeInfo: typ, projectStore: this.projectStore });
        } else if (math.isAccessorNode(node.object)) {
          const targetType = getAccessorNodeType(node.object, context, this.projectStore);
          validateNode({ node: node, context, typeInfo: targetType, projectStore: this.projectStore });
        }
        break;
      case 'boolean':
      case 'string':
        validateNode({ node, context, typeInfo: { type: this.type }, projectStore: this.projectStore });
        break;
      case 'scalar':
        validateScalarNode({ node, context, projectStore: this.projectStore });
        break;
      default:
        throw new Error(`Wrong expression type: ${this.type}`);
    }
  }



}