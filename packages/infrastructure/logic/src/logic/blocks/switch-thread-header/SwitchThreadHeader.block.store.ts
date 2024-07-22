import { computed, makeObservable } from 'mobx';
import { TTypeInfo } from '../../constants';
import { compareTypes, getSingleNodeType, validateNode, validateScalarNode } from '../../util/validateNode';
import { ExpressionBlockStore, IExpressionBlockStoreParams } from '../expression/Expression.block.store';
import * as math from 'mathjs';
import { ISelectOption } from '@falang/editor-scheme';
import { MultipleSelectStore } from '@falang/infrastructure-text';
import { LogicBaseBlockStore } from '../logic-base/LogicBaseBlock.store';
import { IBlockStoreParams } from '@falang/editor-scheme';
import { ExpressionBlockDto } from '../expression/Expression.block.dto';
import { Expression2Store } from '../../expression/Expression2.store';
import { SwitchThreadHeaderBlockDto } from './SwitchThreadHeader.block.dto';
import { IBlockInBlock } from '@falang/editor-scheme';

export interface ISwitchThreadHeaderBlockStoreParams extends IBlockStoreParams, SwitchThreadHeaderBlockDto {
  customValidator?: (block: ExpressionBlockStore) => void
}

export class SwitchThreadHeaderBlockStore extends LogicBaseBlockStore {

  readonly enumSelectStore: MultipleSelectStore;
  readonly expressionStore: Expression2Store;
  private lastSelectOptions: ISelectOption[] = [];
  private lastExpressionType: TTypeInfo | null = null;

  constructor(params: IExpressionBlockStoreParams) {
    super(params);
    this.enumSelectStore = new MultipleSelectStore({
      getOptions: () => this.enumOptions,
      scheme: params.scheme,
      selectedValues: params.expression.split(','),
    });
    this.expressionStore = new Expression2Store({
      scheme: params.scheme,
      expression: params.expression,
      type: 'scalar',
      projectStore: this.projectStore,
    });
    makeObservable(this);
  }

  get expression() {
    return this.expressionStore.expression;
  }

  protected getErrors(): string[] {
    const returnValue = super.getErrors();
    if(this.isEnum) {
      returnValue.push(...this.enumSelectStore.getErrors())
    } else {
      returnValue.push(...this.expressionStore.errors);
      const t = this.scheme.frontRoot.lang.t;
      if (this.expression.trim().length === 0) {
        returnValue.push(t('logic:empty_expression'));
        return returnValue;
      }
      try {
        this.validateExpression();
      } catch (err) {
        console.error(err);
        //console.log('context', this.context);
        returnValue.push(err instanceof Error ? err.message : JSON.stringify(err));
      }
    }

    return returnValue;
  }

  getBlocksInBlock(): IBlockInBlock<any>[] {
    return this.isEnum ? [this.enumSelectStore] : [this.expressionStore];
  }

  protected initShape(): void {
    super.initShape();
    this.enumSelectStore.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });
    this.enumSelectStore.shape.setWidth(() => this.shape.width);
    this.expressionStore.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });
    this.expressionStore.shape.setWidth(() => this.shape.width);
  }

  

  protected validateExpression(): void {
    const node = this.expressionStore.mathNode;
    if (!node) {
      throw new Error('_{logic:wrong_expression}');
    }
    if (math.isSymbolNode(node) && node.name === 'default') {
      return;
    }
    const switchExpressionType = this.switchExpressionType;
    if (!switchExpressionType) {
      throw new Error('_{logic:wrong_type}');
    }
    validateNode({ node, context: this.context, typeInfo: switchExpressionType, projectStore: this.projectStore, })
  }

  @computed get isEnum() {
    return this.switchExpressionType?.type === 'enum';
  }

  @computed get enumOptions(): ISelectOption[] {
    const returnValue = this.enumOptionsPrivate;
    if(!returnValue.length) {
      return this.lastSelectOptions;
    }
    this.lastSelectOptions = returnValue;
    return returnValue;
  }

  @computed private get enumOptionsPrivate(): ISelectOption[] {
    const exprType = this.switchExpressionType;
    if (exprType?.type !== 'enum') return [];
    const currentEnum = this.projectStore.availableEnums.find(
      e => e.schemeId === exprType.schemeId && e.iconId === exprType.iconId
    );
    if(!currentEnum) return [];
    const returnValue = currentEnum.options.map((item) => ({
      text: String(item.key),
      value: String(item.value),
    }));
    returnValue.push({
      text: 'default',
      value: 'default',
    });
    return returnValue;
  }  

  protected getHeight(): number {
    return this.isEnum ? this.enumSelectStore.shape.height : this.expressionStore.height;
  }

  @computed get switchExpressionType(): TTypeInfo | null {
    const type = this.switchExpressionTypePrivate;
    if(!type) {
      return this.lastExpressionType;
    }
    this.lastExpressionType = type;
    return type;
  }

  @computed private get switchExpressionTypePrivate(): TTypeInfo | null {
    const icon = this.scheme.icons.getSafe(this.id);
    if (!icon) return null;
    const parent = icon.parent;
    if (!parent) return null;
    const parentBlock = parent.block;    
    if (!(parentBlock instanceof ExpressionBlockStore)) {
      return null;
    }
    const node = parentBlock.expressionStore.mathNode;
    if (!node) return null;
    const scalarType = getSingleNodeType({ node, context: this.context, projectStore: this.projectStore });
    if (!scalarType) return null;
    if (scalarType.type === 'number' || scalarType.type === 'string' || scalarType.type === 'enum') {
      return scalarType;
    }
    return null;
  }  

  dispose(): void {
    super.dispose();
    this.enumSelectStore.dispose();
    this.expressionStore.dispose();
  }
}
