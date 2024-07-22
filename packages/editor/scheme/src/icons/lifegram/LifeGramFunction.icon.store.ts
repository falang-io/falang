import { computed, makeObservable } from 'mobx';
import { nanoid } from 'nanoid';
import { EmptyBlockStore } from '../../common/blocks/store/EmptyBlockStore';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { IHorisonatalLine, IVericalLine } from '../../common/ILine';
import { IIconWithSkewerStoreParams } from '../../common/skewer/IconWithSkewer.store';
import { ThreadsIconStore } from '../../common/threads/ThreadsIconStore';
import { IIconOutLine } from '../../common/outs/TOutType';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IconStore } from '../base/Icon.store';
import { FunctionIconStore } from '../function/Function.icon.store';
import { calculateFunctionReturnLines } from './calculateFunctionReturnLines';
import type { LifeGramIconStore } from './LifeGram.icon.store';
import { LifeGramFunctionIconComponent } from './LifeGramFunction.icon.cmp';
import type { LifegramReturnIconStore } from './LifegramReturnIcon.store';
import { EmptyIconTransformer } from '../base/EmptyIcon.transformer';
import { BlockTransformer, EmptyBlockTransformer } from '../../common/blocks/Block.transformer';

export interface ILifegramFunctionIconStoreParams extends IIconWithSkewerStoreParams {
  header: IconStore;
  returns: LifegramReturnIconStore[];
  returnGaps: number[];
  footerBlockTransformer?: BlockTransformer;
}

export class LifegramFunctionIconStore extends FunctionIconStore {
  readonly footerBlockTransformer: BlockTransformer;
  constructor(params: ILifegramFunctionIconStoreParams) {
    const footerId = params.id.concat('-footer');
    const footerBlockTransformer = params.footerBlockTransformer ?? EmptyBlockTransformer.getTransformer();
    super({
      ...params,
      footer: new ThreadsIconStore<LifegramReturnIconStore>({
        alias: 'system',
        block: footerBlockTransformer.create(params.scheme, footerId),
        children: params.returns,
        editable: true,
        id: footerId,
        scheme: params.scheme,
        disableOutlines: true,
        verticalAlign: 'bottom',
        transformer: EmptyIconTransformer.getTransformer(),
        gaps: params.returnGaps,
      })
    });
    this.footerBlockTransformer = footerBlockTransformer;
    this.footer.setParentId(this.id);
    makeObservable(this);
    this.block.resizeBarGap = 0;
  }

  initShape(): void {
    super.initShape();
    const footer = this.footer as ThreadsIconStore;
    this.footer.shape.setSize({
      leftSize: () => footer.threads.shape.leftSize,
      rightSize: () => footer.threads.shape.rightSize,
      height: () => {
        return footer.threads.shape.height
      },
    });
    footer.threads.position.setPosition({
      x: () => this.position.x,
      y: () => {
        const parent = this.parent as LifeGramIconStore;
        if (!parent || !parent.threads) {
          return this.position.y + this.block.shape.height + this.header.shape.height + CELL_SIZE * 2 + this.skewer.shape.height;
        }
        return parent.threads.position.y + parent.threads.iconsMaxHeight - footer.threads.iconsMaxHeight;
      },
    });
    footer.threads.valencePointY = () => footer.threads.position.y + footer.threads.shape.height - CELL_HALF;
    footer.threads.gapControlsY = () => footer.threads.position.y + footer.threads.shape.height - CELL_SIZE * 3;

    this.header.shape.setSize({
      leftSize: 0,
      rightSize: 0,
      height: 0,
    });
    this.skewer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height + this.header.shape.height + CELL_SIZE * 2,
    });
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y + this.header.shape.height + CELL_SIZE,
    });
    this.shape.setSize({
      height: () =>
        this.header.shape.height
        + this.block.shape.height
        + this.skewer.shape.height
        + this.footer.shape.height
        + CELL_SIZE * 2,
      leftSize: () => Math.max(
        this.header.shape.leftSize,
        this.block.shape.leftSize,
        this.skewer.shape.leftSize,
        this.footer.shape.leftSize,
      ),
      rightSize: () => Math.max(
        this.header.shape.rightSize,
        this.block.shape.rightSize,
        this.skewer.shape.rightSize,
        this.footer.shape.rightSize,
      ),
    });
  }

  protected getIconOutLines(): IIconOutLine[] {
    return [];
  }

  @computed get trianglePolylinePoints(): string {
    const x = this.position.x;
    const y = this.position.y + this.block.shape.height + CELL_SIZE;
    //console.log('shape', this.block.shape, this.block.shape.rightSize);
    //console.log(this.block);

    return [
      [x + this.block.shape.rightSize, y],
      [x, y + CELL_SIZE],
      [x - this.block.shape.leftSize, y],
    ].map(p => p.join(',')).join(' ');
  }

  getRenderer(): TIconRenderer<any> {
    return LifeGramFunctionIconComponent;
  }

  getReturnDepth(): number {
    return (this.footer as ThreadsIconStore).threads.size;
  }

  @computed get filteredOutLines(): IIconOutLine[] {
    return this.skewer.getIconOutLines().filter((outline) => outline.type === 'return' || outline.type === 'main').sort((a, b) => a.x - b.x)
  }

  @computed get firstVerticalLines(): IVericalLine[] {
    const returnValue: IVericalLine[] = [];
    const startY = this.skewer.position.y + this.skewer.shape.height;
    const outLines = this.filteredOutLines;
    //('outlines', outLines);
    const length = outLines.length;
    outLines.forEach((outline) => {
      const y1 = outline.y;
      const y2 = startY + (outline.level - 1) * CELL_SIZE;
      if (y1 === y2) return;
      returnValue.push({
        targetId: outline.targetId,
        type: outline.type,
        x: outline.x,
        y1,
        y2,
      });
    });
    return returnValue;
  }

  @computed get returnLines() {
    return calculateFunctionReturnLines(this);
  }


  @computed get secondVerticalLines(): IVericalLine[] {
    return [];
    /*const returnValue: IVericalLine[] = [];
    const returnPositions = this.returnsXPositions;
    if(!returnPositions.length) return returnValue;
    const startY = this.threadsFooter.threads.position.y;
    const finishY = this.footer.position.y;
    returnPositions.forEach((x, index) => {
      returnValue.push({
        targetId: this.id,
        type: 'return',
        x,
        y1: startY + CELL_SIZE * index,
        y2: finishY,
      })
    })
    return returnValue;*/
  }

  get threadsFooter(): ThreadsIconStore {
    return this.footer as ThreadsIconStore
  }

  @computed get thirdVerticalLines(): IVericalLine[] {
    return [];
    const footer = this.footer as ThreadsIconStore;
    const returnValue: IVericalLine[] = [];
    const y1 = this.threadsFooter.threads.position.y;
    const returnsHeight = footer.threads.shape.height;
    footer.threads.icons.forEach((icon) => {
      const y2 = y1 + returnsHeight - icon.shape.height;
      if (y2 <= y1) return;
      returnValue.push({
        targetId: icon.id,
        type: 'return',
        x: icon.position.x,
        y1,
        y2,
      });
    });
    return returnValue;
  }

  @computed get allVerticalLines(): IVericalLine[] {
    return this.firstVerticalLines.concat(this.secondVerticalLines).concat(this.thirdVerticalLines);
  }

  protected getReturnXPosition(index: number): number {
    return this.returnsXPositions[index] || 0;
  }

  @computed.struct get returnsXPositions(): number[] {
    return (this.footer as ThreadsIconStore).list.icons.map(icon => icon.position.x);
  }

  @computed.struct get connectHorisontalLines(): IHorisonatalLine[] {
    const returnValue: IHorisonatalLine[] = [];
    const returnPositions = this.returnsXPositions;
    if (!returnPositions.length) return returnValue;
    const startY = this.skewer.position.y + this.skewer.shape.height;
    returnPositions.forEach((x, index) => {
      const allReturnsWithCurrentLevel = this.filteredOutLines.filter((outline) => outline.level === index + 1);
      if (!allReturnsWithCurrentLevel.length) {
        return;
      }
      allReturnsWithCurrentLevel.sort((a, b) => (a.x - b.x));
      const lastReturn = allReturnsWithCurrentLevel[allReturnsWithCurrentLevel.length - 1];
      returnValue.push({
        targetId: lastReturn.targetId,
        type: lastReturn.type,
        y: startY + index * CELL_SIZE,
        x1: lastReturn.x,
        x2: x,
        nextShoe: false,
        shoe: false,
      })
    });
    return returnValue;
  }
  

}