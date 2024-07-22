import { IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE, CELL_SIZE_4 } from '@falang/editor-scheme';
import { IBlockBadge } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { IBlockLine } from '@falang/editor-scheme';
import { TContext } from '../../constants';
import { Expression2Store } from "../../expression/Expression2.store";
import { validateExpression2, validateExpression2Name } from '../../util/validateExpression2';
import { validateNode } from '../../util/validateNode';
import { LogicBaseBlockStore } from "../logic-base/LogicBaseBlock.store";
import { FromToCycleHeaderBlockDto } from "./FromToCycleHeader.block.dto";

export interface IFromToCycleHeaderBlockStoreParams extends IBlockStoreParams, FromToCycleHeaderBlockDto {
}

const BADGES_WIDTH = CELL_SIZE_4;

export class FromToCycleHeaderBlockStore extends LogicBaseBlockStore {
  readonly fromExpression: Expression2Store;
  readonly toExpression: Expression2Store;
  readonly itemExpression: Expression2Store;

  constructor(params: IFromToCycleHeaderBlockStoreParams) {
    super(params);
    this.fromExpression = new Expression2Store({
      expression: params.from,
      scheme: params.scheme,
      type: 'number',
      minHeight: CELL_SIZE,
      projectStore: this.projectStore,
    });
    this.toExpression = new Expression2Store({
      expression: params.to,
      scheme: params.scheme,
      type: 'number',
      minHeight: CELL_SIZE,
      projectStore: this.projectStore,
    });
    this.itemExpression = new Expression2Store({
      expression: params.item,
      scheme: params.scheme,
      type: 'newName',
      minHeight: CELL_SIZE,
      projectStore: this.projectStore,
    });
  }

  protected initShape(): void {
    super.initShape();

    this.itemExpression.position.setPosition({
      x: () => this.position.x + BADGES_WIDTH,
      y: () => this.position.y,
    });
    this.itemExpression.shape.setWidth(() => this.width - BADGES_WIDTH);

    this.fromExpression.position.setPosition({
      x: () => this.position.x + BADGES_WIDTH,
      y: () => this.position.y + this.itemExpression.height,
    });
    this.fromExpression.shape.setWidth(() => this.width - BADGES_WIDTH);

    this.toExpression.position.setPosition({
      x: () => this.position.x + BADGES_WIDTH,
      y: () => this.position.y + this.itemExpression.height + this.fromExpression.height,
    });
    this.toExpression.shape.setWidth(() => this.width - BADGES_WIDTH);

    this.shape.setHeight(() => this.fromExpression.height + this.toExpression.height + this.itemExpression.height);
  }

  getBlocksInBlock(): IBlockInBlock<any>[] {
    return [
      ...super.getBlocksInBlock(),
      this.fromExpression,
      this.toExpression,
      this.itemExpression,
    ];
  }

  getBlockBadges(): IBlockBadge[] {
    const t = this.scheme.frontRoot.lang.t;
    return [
      ...super.getBlockBadges(),
      { 
        dx: 0,
        dy: 0,
        text: t('base:variable'),
      },
      { 
        dx: 0,
        dy: this.itemExpression.height,
        text: t('base:from'),
      },
      {
        dx: 0,
        dy: this.fromExpression.height + this.itemExpression.height,
        text: t('logic:to'),
      },
    ];
  }

  getBlockLines(): IBlockLine[] {
    const w = this.width;
    const fromHeight = this.fromExpression.height;
    const itemHeight = this.itemExpression.height;
    const h = this.shape.height;
    return [
      {
        dx1: -CELL_SIZE,
        dx2: w + CELL_SIZE,
        dy1: itemHeight,
        dy2: itemHeight,
      },
      {
        dx1: -CELL_SIZE,
        dx2: w + CELL_SIZE,
        dy1: fromHeight + itemHeight,
        dy2: fromHeight + itemHeight,
      },
      {
        dx1: BADGES_WIDTH,
        dx2: BADGES_WIDTH,
        dy1: 0,
        dy2: h,
      },
    ];
  }
  
  protected getErrors(): string[] {
    const returnValue = super.getErrors().concat([
      validateExpression2({ store: this.fromExpression, context: this.context, projectStore: this.projectStore, typeInfo: { type: 'number', numberType: 'integer', integerType: 'int64' }}),
      validateExpression2({ store: this.toExpression, context: this.context, projectStore: this.projectStore, typeInfo: { type: 'number', numberType: 'integer', integerType: 'int64' }}),
      validateExpression2Name({ store: this.itemExpression, context: this.context }),
    ].flat());
    return returnValue;
  }

  dispose(): void {
    super.dispose();
    this.itemExpression.dispose();
    this.fromExpression.dispose();
    this.toExpression.dispose();
  }

  protected getScopeVariables(): TContext {
    const returnValue = super.getExportedVariables();
    const indexName = this.itemExpression.expression;
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