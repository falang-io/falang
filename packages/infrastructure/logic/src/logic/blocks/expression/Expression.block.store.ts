import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { IBlockStoreParams } from '@falang/editor-scheme';
import { IUnionTypeInfo, TContext, TExpressionType, TVariableInfo } from '../../constants';
import { LogicBaseBlockStore } from '../logic-base/LogicBaseBlock.store';
import { ExpressionBlockDto } from './Expression.block.dto';
import { CELL_SIZE } from '@falang/editor-scheme';
import { ExpressionStore } from '../../expression/Expression.store';
import * as math from 'mathjs';
import { IBlockWithVariableType } from '../../util/IBlockWithVariableType';
import { getAccessorNodeType, getVariableNodeType, validateNode, validateScalarNode } from '../../util/validateNode';
import { AutocompleteOption } from '@falang/editor-scheme';
import { match } from 'assert';


export interface IExpressionBlockStoreParams extends IBlockStoreParams, ExpressionBlockDto {
  customValidator?: (block: ExpressionBlockStore) => void
}

export class ExpressionBlockStore extends LogicBaseBlockStore implements IBlockWithVariableType {
  readonly expressionStore: ExpressionStore;
  readonly type: TExpressionType;
  @observable.ref private _variableType: TVariableInfo | null;

  constructor(params: IExpressionBlockStoreParams) {
    super({
      ...params,
      minWidth: params.minWidth ?? (params.type === 'create' ? CELL_SIZE * 8 : CELL_SIZE * 6),
    });
    this.type = params.type;
    this._variableType = params.variableType;
    this.expressionStore = new ExpressionStore({
      expression: params.expression,
      scheme: params.scheme,
    });
    makeObservable(this);
    runInAction(() => {
      this.expressionStore.code.width = () => this.width;
    });
  }

  get expression() {
    return this.expressionStore.expression;
  }

  get variableType(): TVariableInfo | null {
    switch (this.type) {
      case 'create':
        return this._variableType;
      case 'assign': {
        const expression = this.expression;
        const matchResult = expression.match(/^([a-zA-Z][a-zA-Z0-9\._]*)[ ]*[=]{1,2}/);
        if (!matchResult) return null;
        return getVariableNodeType(matchResult[1], this.context, this.projectStore);
      }
      case 'scalar':
        return getVariableNodeType(this.expression, this.context, this.projectStore);
      case 'boolean': {
        const expression = this.expression;
        const matchResult = expression.match(/^([a-zA-Z][a-zA-Z0-9\._]*)[ ]*[=]{2}/);
        if (!matchResult) return null;
        return getVariableNodeType(matchResult[1], this.context, this.projectStore);
      }
      case 'string': {
        return { type: 'string' };
      }
    }
    return null;
  }

  @action setExpression(expression: string) {
    this.expressionStore.code.setCode(expression)
  }

  @action setVariableType(type: TVariableInfo | null) {
    this._variableType = type;
  }

  getExportedVariables(): Record<string, TVariableInfo> {
    const returnValue: Record<string, TVariableInfo> = super.getExportedVariables();
    if (this.type === 'create' && this._variableType && this.variableName) {
      returnValue[this.variableName] = this.projectStore.getFilledType(this._variableType);
    }
    return returnValue;
  }

  @computed get variableName(): string | null {
    const expression = this.expression;
    const matchResult = expression.match(/^([a-zA-Z][a-zA-Z0-9\._]*)[ ]*[=]{1,2}/);
    if (matchResult) return matchResult[1];
    const matchResult2 = expression.match(/^([a-zA-Z][a-zA-Z0-9\._]*)/);
    if (matchResult2) return matchResult2[1];
    return null;
  }

  protected getHeight(): number {
    return this.expressionStore.height + this.extraHeight;
  }

  get expressionType(): TExpressionType | null {
    const node = this.expressionStore.mathNode;
    if (typeof node === 'string') return null;
    return 'boolean';
  }

  protected getErrors(): string[] {
    const returnValue = super.getErrors();
    returnValue.push(...this.expressionStore.errors);
    const t = this.scheme.frontRoot.lang.t;
    const expression = this.expression;
    if (expression.trim().length === 0) {
      returnValue.push(t('logic:empty_expression'));
      return returnValue;
    }
    try {
      this.validateExpression();
    } catch (err) {
      console.error(err);
      returnValue.push(err instanceof Error ? err.message : JSON.stringify(err));
    }
    if (returnValue.length) return returnValue;
    const matchResult = expression.matchAll(/\{([a-zA-Z][a-zA-Z0-9\._]*)\}/g);
    for (const matchItem of matchResult) {
      const nodeType = getVariableNodeType(matchItem[1], this.context, this.projectStore);
      if (!nodeType) {
        const message = this.scheme.frontRoot.lang.t('logic:wrong_variable');
        returnValue.push(`${message}: ${matchItem[1]}`);
      }
    }
    return returnValue;
  }

  protected validateExpression() {
    const node = this.expressionStore.mathNode;
    const variableName = this.variableName;
    const variableType = this.variableType;
    const context = this.fullContext;
    if (!node) throw new Error('Wrong node');
    switch (this.type) {
      case 'create':
        if (!variableName) throw new Error('_{logic:wrong_assign}');
        if (variableName in context) throw new Error(`_{logic:variable_already_exists}: ${variableName}`);
        if (!math.isAssignmentNode(node)) {
          if(math.isSymbolNode(node)) break;
          throw new Error('_{logic:wrong_assign}');
        };
        if (!variableType) throw new Error('No variable type');
        validateNode({ node: node.value, context, typeInfo: variableType, projectStore: this.projectStore });
        break;
      case 'assign':
        if (!variableName) throw new Error('_{logic:wrong_assign}');
        const assignVariableType = getVariableNodeType(variableName, context, this.projectStore );
        //console.log({ assignVariableType, variableName, context});
        if(!assignVariableType) {
          throw new Error(`_{logic:variable_not_found}: ${variableName}`);
        }
        /*if (context[variableName].constant) {
          throw new Error(`_{logic:variable_is_constant}: ${variableName}`);
        }*/
        if (!math.isAssignmentNode(node)) throw new Error('_{logic:wrong_assign}');
        if (node.index) {
          const typ = getAccessorNodeType(node, context, this.projectStore );
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
        } else {
          throw new Error('_{logic:wrong_assign}');
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

  @computed get extraHeight(): number {
    if (this.type !== 'create') return 0;
    const vType = this.variableType;
    if (!vType) return 0;
    if (vType.type === 'array') return CELL_SIZE * 3;
    if (vType.type !== 'number') return CELL_SIZE * 2;
    if (vType.numberType === 'decimal') return CELL_SIZE * 3;
    return CELL_SIZE * 2;
  }

  dispose(): void {
    this.expressionStore.dispose();
    super.dispose();
  }

  @computed get enumContext(): TContext {
    const returnValue: TContext = {};
    const vType = this.variableType;
    //console.log('vType', vType?.type, this.type);
    if (vType?.type !== 'enum') {
      return returnValue;
    }
    const enm = this.projectStore.availableEnums.find((e) => e.iconId == vType.iconId && e.schemeId === vType.schemeId)
    enm?.options.forEach((o) => {
      if (o.key in this.context) return;
      returnValue[o.key] = {
        type: 'enum',
        iconId: enm.iconId,
        schemeId: enm.schemeId,
      }
    });
    //console.log('enumContext', returnValue);
    return returnValue;
  }

  @computed private get fullContext() {
    return {
      ...this.context,
      ...this.enumContext,
    }
  }

  getAutoComplete(code: string, index: number): AutocompleteOption[] {
    return super.getAutoComplete(code, index, this.enumContext)
  }
}