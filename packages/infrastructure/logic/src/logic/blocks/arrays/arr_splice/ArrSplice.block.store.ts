import { IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE, CELL_SIZE_4 } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { Expression2Store } from '../../../expression/Expression2.store';
import { LogicBaseBlockStore } from '../../logic-base/LogicBaseBlock.store';
import { ArrSpliceBlockDto } from './ArrSplice.block.dto';

export interface IArrSpliceBlockStoreParams extends IBlockStoreParams, ArrSpliceBlockDto {}

const BADGES_WIDTH = CELL_SIZE_4;

export class ArrSpliceBlockStore extends LogicBaseBlockStore {
  arrExpr: Expression2Store;
  variableExpr: Expression2Store;
  startExpr: Expression2Store;
  endExpr: Expression2Store;

  constructor(params: IArrSpliceBlockStoreParams) {
    super(params);
    this.arrExpr = new Expression2Store({
      expression: params.arr,
      scheme: params.scheme,
      type: 'array',
      minHeight: CELL_SIZE,
      projectStore: this.projectStore,
    });
    this.startExpr = new Expression2Store({
      expression: params.variable,
      scheme: params.scheme,
      type: 'number',
      minHeight: CELL_SIZE,
      projectStore: this.projectStore,
    });
    this.endExpr = new Expression2Store({
      expression: params.variable,
      scheme: params.scheme,
      type: 'number',
      minHeight: CELL_SIZE,
      projectStore: this.projectStore,
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

    this.startExpr.position.setPosition({
      x: () => this.position.x + BADGES_WIDTH,
      y: () => this.arrExpr.position.y + this.arrExpr.shape.height,
    });
    this.startExpr.shape.setWidth(() => this.width - BADGES_WIDTH);

    this.endExpr.position.setPosition({
      x: () => this.position.x + BADGES_WIDTH,
      y: () => this.startExpr.position.y + this.startExpr.shape.height,
    });
    this.endExpr.shape.setWidth(() => this.width - BADGES_WIDTH);

    this.variableExpr.position.setPosition({
      x: () => this.position.x + BADGES_WIDTH,
      y: () => this.endExpr.position.y + this.endExpr.shape.height,
    });
    this.variableExpr.shape.setWidth(() => this.width - BADGES_WIDTH);
  }

  protected getHeight(): number {
    return CELL_SIZE + this.arrExpr.height + this.variableExpr.height + this.startExpr.height + this.endExpr.height;
  }

  getBlocksInBlock() {
    return [
      ...super.getBlocksInBlock(),
      this.arrExpr,
      this.variableExpr,
      this.startExpr,
      this.endExpr,
    ];
  }

  getBlockBadges() {
    const t = this.scheme.frontRoot.lang.t;
    return [
      ...super.getBlockBadges(),
      { 
        dx: 0,
        dy: 0,
        text: t('logic:arr_splice'),
      },
      { 
        dx: 0,
        dy: CELL_SIZE,
        text: t('base:array'),
      },
      { 
        dx: 0,
        dy: this.arrExpr.height + CELL_SIZE,
        text: t('logic:index_from'),
      },
      { 
        dx: 0,
        dy: this.arrExpr.height + CELL_SIZE + this.startExpr.height,
        text: t('logic:index_to'),
      },
      { 
        dx: 0,
        dy: this.arrExpr.height + CELL_SIZE + this.startExpr.height + this.endExpr.height,
        text: t('base:variable'),
      },
    ];
  }

  getBlockLines() {
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
      dx1: 0,
      dx2: this.shape.width,
      dy1: CELL_SIZE + this.arrExpr.height + this.startExpr.height,
      dy2: CELL_SIZE + this.arrExpr.height + this.startExpr.height,
    },{
      dx1: 0,
      dx2: this.shape.width,
      dy1: CELL_SIZE + this.arrExpr.height + this.startExpr.height + this.endExpr.height,
      dy2: CELL_SIZE + this.arrExpr.height + this.startExpr.height + this.endExpr.height,
    },{
      dx1: BADGES_WIDTH,
      dx2: BADGES_WIDTH,
      dy1: CELL_SIZE,
      dy2: CELL_SIZE + this.arrExpr.height + this.startExpr.height + this.endExpr.height + this.variableExpr.height,
    }];
  }

  getErrors() {
    return [
      this.arrExpr.errors,
      this.variableExpr.errors,
      this.startExpr.errors,
      this.endExpr.errors,
    ].flat();
  }

  dispose() {
    this.arrExpr.dispose();
    this.variableExpr.dispose();
    this.startExpr.dispose();
    this.endExpr.dispose();
  }
}
