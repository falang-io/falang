import * as math from 'mathjs';
import { computed, makeObservable, runInAction } from 'mobx';
import { CodeStore, CodeStoreParams } from '@falang/infrastructure-code';
import { SchemeStore } from '@falang/editor-scheme';

export interface IExpressionStoreParams {
  scheme: SchemeStore,
  expression: string,
  minHeight?: number,
  singleLine?: boolean,
}

/**
 * @deprecated use Expression2Store
 */
export class ExpressionStore {
  readonly scheme: SchemeStore;
  readonly code: CodeStore;

  constructor(params: IExpressionStoreParams) {
    this.code = new CodeStore({
      ...params,
      code: params.expression,
      language: 'js',
      minHeight: params.minHeight,
    });
    this.scheme = params.scheme;
    makeObservable(this);
  }

  @computed get height() {
    return this.code.height;
  }

  get expression() {
    return this.code.code;
  }

  setExpression(expression: string) {
    this.code.setCode(expression);
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
    this.code.dispose();
  }




}