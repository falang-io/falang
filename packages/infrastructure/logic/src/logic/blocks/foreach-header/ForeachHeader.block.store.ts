import * as math from 'mathjs';
import { computed, makeObservable } from 'mobx';
import { IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { TContext, TVariableInfo } from '../../constants';
import { ExpressionStore } from '../../expression/Expression.store';
import { LogicBaseBlockStore } from '../logic-base/LogicBaseBlock.store';
import { getNodeVariableType } from '../../util/getNodeVariableType';

interface IForeachHeaderBlockStoreParams extends IBlockStoreParams {
  arr: string;
  item: string;
  index: string; 
}

export class ForeachHeaderBlockStore extends LogicBaseBlockStore {
  readonly arrExpression: ExpressionStore;
  readonly itemExpression: ExpressionStore;
  readonly indexExpression: ExpressionStore;

  constructor(params: IForeachHeaderBlockStoreParams) {
    super(params);
    this.arrExpression = new ExpressionStore({
      expression: params.arr,
      scheme: params.scheme,
      minHeight: CELL_SIZE,
    });
    this.itemExpression = new ExpressionStore({
      expression: params.item,
      scheme: params.scheme,
      minHeight: CELL_SIZE,
    });
    this.indexExpression = new ExpressionStore({
      expression: params.index,
      scheme: params.scheme,
      minHeight: CELL_SIZE,
    });
    makeObservable(this);
  }

  protected initShape(): void {
    super.initShape();
    this.arrExpression.code.width = () => this.width - CELL_SIZE * 4;
    this.itemExpression.code.width = () => this.width - CELL_SIZE * 4;
    this.indexExpression.code.width = () => this.width - CELL_SIZE * 4;
  }

  @computed get hasIndex(): boolean {
    return !!this.indexExpression.expression.length;
  }

  protected getHeight(): number {
    const isMeEditing = this.scheme.editing.editingIconId === this.id;
    return this.arrExpression.height + this.itemExpression.height + (this.hasIndex || isMeEditing ? this.indexExpression.height : 0);
  }

  protected getErrors(): string[] {
    const returnValue = super.getErrors();
    try {
      this.validateArrExpression();
      this.validateItemExpression();
      this.validateIndexExpression();
    } catch (err) {
      returnValue.push(err instanceof Error ? err.message : 'Unknown error');
    }
    return returnValue;
  }

  protected validateArrExpression(): void {
    const node = this.arrExpression.mathNode;
    if(!node) {
      throw new Error('_{logic:wrong_expression}');
    }
    const context = this.context;
    getNodeVariableType(node, context, this.projectStore);
  }

  @computed protected get arrType(): TVariableInfo | null {
    const node = this.arrExpression.mathNode;
    if(!node) return null;
    try {
      return getNodeVariableType(node, this.context, this.projectStore);
    } catch (err) {
      return null;
    }
  }  

  protected validateItemExpression(): void {
    const node = this.itemExpression.mathNode;
    if(!node) {
      throw new Error('_{logic:wrong_expression}');
    }
    const context = this.context;
    if(!math.isSymbolNode(node)) {
      throw new Error('_{logic:wrong_variable_name}');
    }
    const name = node.name;
    if(name in context) {
      throw new Error('_{logic:variable_already_exists}');
    }
  }

  @computed protected get itemName(): string | null {
    const node = this.itemExpression.mathNode;
    if(!math.isSymbolNode(node)) return null;
    return node.name;
  }

  @computed protected get indexName(): string | null {
    const node = this.indexExpression.mathNode;
    if(!math.isSymbolNode(node)) return null;
    return node.name;
  }

  @computed protected get itemType(): TVariableInfo | null {
    const arrType = this.arrType;
    if(!arrType || arrType.type !== 'array') return null;
    return arrType.elementType;    
  }

  protected validateIndexExpression(): void {
    if(!this.indexExpression.expression.length) return;
    const node = this.indexExpression.mathNode;
    if(!math.isSymbolNode(node)) {
      throw new Error('_{logic:wrong_variable_name}');
    };
    const context = this.context;
    if(node.name in context) {
      throw new Error('_{logic:variable_already_exists}');
    }
  }

  protected getScopeVariables(): TContext {
    const returnValue = super.getExportedVariables();
    const itemName = this.itemName;
    const itemType = this.itemType;
    if(itemName && itemType) {
      returnValue[itemName] = this.projectStore.getFilledType(itemType);
    }
    const indexName = this.indexName;
    if(indexName) {
      returnValue[indexName] = {
        type: 'number',
        numberType: 'integer',
        integerType: 'int32',
      }
    }
    return returnValue;
  }
}
