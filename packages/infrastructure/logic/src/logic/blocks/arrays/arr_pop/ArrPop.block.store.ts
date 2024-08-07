import { IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE, CELL_SIZE_4 } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { IBlockLine } from '@falang/editor-scheme';
import { TContext } from '../../../constants';
import { Expression2Store } from '../../../expression/Expression2.store';
import { getVariableNodeType } from '../../../util/validateNode';
import { LogicBaseBlockStore } from '../../logic-base/LogicBaseBlock.store';
import { ArrPopBlockDto } from './ArrPop.block.dto';

export interface IArrPopBlockStoreParams extends IBlockStoreParams, ArrPopBlockDto {}

const BADGES_WIDTH = CELL_SIZE_4;

export class ArrPopBlockStore extends LogicBaseBlockStore {
  arrExpr: Expression2Store;
  variableExpr: Expression2Store;

  constructor(params: IArrPopBlockStoreParams) {
    super(params);
    this.arrExpr = new Expression2Store({
      expression: params.arr,
      scheme: params.scheme,
      type: 'array',
      minHeight: CELL_SIZE,
      getVariableType: () => {
        const arrName = this.arrExpr.expression;
        const arrType = getVariableNodeType(arrName, this.context, this.projectStore);
        return arrType;
      },
      projectStore: this.projectStore
    });
    this.variableExpr = new Expression2Store({
      expression: params.variable,
      scheme: params.scheme,
      type: 'newName',
      minHeight: CELL_SIZE,
      projectStore: this.projectStore,
    });
  }

  initShape() {
    super.initShape();
    this.arrExpr.position.setPosition({
      x: () => this.position.x + BADGES_WIDTH,
      y: () => this.position.y + CELL_SIZE,
    });
    this.arrExpr.shape.setWidth(() => this.width - BADGES_WIDTH);

    this.variableExpr.position.setPosition({
      x: () => this.position.x + BADGES_WIDTH,
      y: () => this.position.y + this.arrExpr.shape.height + CELL_SIZE,
    });
    this.variableExpr.shape.setWidth(() => this.width - BADGES_WIDTH);
  }

  protected getHeight(): number {
    return CELL_SIZE + this.arrExpr.height + this.variableExpr.height;
  }

  getBlocksInBlock() {
    return [
      ...super.getBlocksInBlock(),
      this.arrExpr,
      this.variableExpr,
    ];
  }

  getBlockBadges() {
    const t = this.scheme.frontRoot.lang.t;
    return [
      ...super.getBlockBadges(),
      { 
        dx: 0,
        dy: 0,
        text: t('logic:arr_pop'),
      },
      { 
        dx: 0,
        dy: CELL_SIZE,
        text: t('base:array'),
      },
      { 
        dx: 0,
        dy: this.arrExpr.height + CELL_SIZE,
        text: t('base:variable'),
      },
    ];
  }

  getBlockLines(): IBlockLine[] | null {
    return [{
      dx1: 0,
      dx2: this.shape.width,
      dy1: CELL_SIZE,
      dy2: CELL_SIZE
    },{
      dx1: 0,
      dx2: this.shape.width,
      dy1: CELL_SIZE + this.arrExpr.height,
      dy2: CELL_SIZE + this.arrExpr.height,
    },{
      dx1: BADGES_WIDTH,
      dx2: BADGES_WIDTH,
      dy1: CELL_SIZE,
      dy2: CELL_SIZE + this.arrExpr.height + this.variableExpr.height,
    }];
  }

  getErrors() {
    return [
      this.arrExpr.errors,
      this.variableExpr.errors,
    ].flat();
  }

  dispose() {
    this.arrExpr.dispose();
    this.variableExpr.dispose();
  }

  protected getExportedVariables(): TContext {
    const returnValue: TContext = {
      ...super.getExportedVariables()
    };
    const context = this.context;
    const arrName = this.arrExpr.expression;
    const arrType = getVariableNodeType(arrName, context, this.projectStore);
    const variableName = this.variableExpr.expression;
    if(variableName.length && arrType && arrType.type === 'array') {
        returnValue[variableName] = this.projectStore.getFilledType(arrType.elementType);
    }
    return returnValue; 
  }
}
