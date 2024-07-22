import { computed, makeObservable } from 'mobx';
import { CELL_SIZE, CELL_HALF } from '../../common/constants';
import { IHorisonatalLine, IVericalLine } from '../../common/ILine';
import { IconWithSkewerStore, IIconWithSkewerStoreParams } from '../../common/skewer/IconWithSkewer.store';
import { typeOrder } from '../../common/skewer/Skewer.store';
import { TPath } from '../../common/TPath';
import { OutStore } from '../../common/outs/Out.store';
import { IIconOutLine } from '../../common/outs/TOutType';

export const CYCLE_ICON_LINE_GAP = CELL_SIZE;

export interface CycleIconParams extends IIconWithSkewerStoreParams {
  hideBackArrow?: boolean
}

export class CycleIconStore extends IconWithSkewerStore {

  readonly hideBackArrow: boolean;

  constructor(params: CycleIconParams) {
    super(params);
    this.hideBackArrow = !!params.hideBackArrow;
    makeObservable(this);
  }

  @computed get arrowTopX(): number {
    return this.getArrowTopX();
  }

  protected getArrowTopX(): number {
    return this.position.x;
  }

  @computed get arrowTopY(): number {
    return this.getArrowTopY();
  }

  protected getArrowTopY(): number {
    return this.position.y + CELL_HALF;
  }

  @computed get arrowBottomY(): number {
    return this.getArrowBottomY();
  }

  protected getArrowBottomY(): number {
    return this.position.y + this.shape.height;
  }

  @computed get arrowBottomX(): number {
    return this.getArrowBottomX();
  }

  protected getArrowBottomX(): number {
    return this.position.x;
  }

  @computed get continueArrowX(): number {
    return this.getContinueArrowX();
  }

  protected getContinueArrowX(): number {
    return this.position.x;
  }

  @computed get breakArrowX(): number {
    return this.getBreakArrowX();
  }

  protected getBreakArrowX(): number {
    return this.position.x;
  }

  @computed get breakArrowY(): number {
    return this.getBreakArrowY();
  }

  protected getBreakArrowY(): number {
    return this.arrowBottomY;
  }

  isCycle(): boolean {
    return true;
  }

  removeChild(): void {
    throw new Error('Cant delete child from while icon');
  }

  /*
  @computed get hasContinues(): boolean {
    console.log('hasCont', this.id, this.scheme.outs.cycleHasContinue(this.id));
    return this.scheme.outs.cycleHasContinue(this.id);
  }
  */

  @computed get vericalBrakeLineX(): number {
    const breakLines = this.myBreaksLines;
    if (!breakLines.length) return 0;
    return breakLines[0].x;
  }

  @computed get verticalBrakeLineY(): number {
    const breakLines = this.myBreaksLines;
    if (!breakLines.length) return 0;
    return breakLines[0].y;
  }

  protected getOutsIds(): string[] {
    const skewerOutsIds = this.outsIds;
    const returnIds = skewerOutsIds.filter((outId) => {
      const icon = this.scheme.icons.get(outId) as OutStore;
      const targetCycleId = icon.targetId;
      return targetCycleId !== this.id;
    })
    return returnIds;
  }

  @computed.struct get myBreaksLines(): IIconOutLine[] {
    const returnValue: IIconOutLine[] = []
    const skewerOuts = super.getIconOutLines();
    skewerOuts.forEach((outline) => {
      if (outline.type === 'break' && outline.level === 1) {
        returnValue.push(outline);
      }
    });
    returnValue.sort((a, b) => b.y - a.y);
    return returnValue;
  }

  @computed.struct get notMyBreakLines(): IIconOutLine[] {
    const returnValue: IIconOutLine[] = []
    const skewerOuts = super.getIconOutLines();
    skewerOuts.forEach((outline) => {
      if (outline.type !== 'break' || outline.level !== 1) {
        returnValue.push(outline);
      }
    });
    return returnValue;
  }

  /**
   * @deprecated
   */
  @computed.struct get transitLines(): IVericalLine[] {
    const returnValue: IVericalLine[] = [];
    const notMyBreakLines = this.notMyBreakLinesSortedByPriority;
    if (notMyBreakLines.length) {
      //  
      const y = this.position.y + this.shape.height - CELL_HALF - CELL_SIZE;
      notMyBreakLines.forEach((br, index) => {
        if (br.type === 'main') return;
        returnValue.push({
          x: br.x,
          y1: br.y,
          y2: y + index * CELL_SIZE,
          targetId: br.targetId,
          type: br.type,
        })
      });
    }
    return returnValue;
  }

  /**
   * @deprecated
   */
  @computed get notMyBreakLinesSortedByPriority(): IIconOutLine[] {
    const notMyBreakLines = this.notMyBreakLines.filter(line => line.type !== 'main' && line.type !== 'continue');
    notMyBreakLines.sort((a, b) => {
      if(a.type === b.type) {
        if(a.type === 'continue') {
          return a.level - b.level;
        }
        return b.level - a.level;
      }
      return typeOrder.indexOf(b.type) - typeOrder.indexOf(a.type);
    });
    return notMyBreakLines;
  }

  @computed get hasBreak(): boolean {
    return !!this.myBreaksLines.length
  }

  protected getIconOutLines(): IIconOutLine[] {
    const parentOutlines = super.getIconOutLines();
    const returnValue: IIconOutLine[] = [];
    for(const out of parentOutlines) {
      let level = out.level;
      if(out.type === 'break' || out.type === 'continue') {
        if(level === 1) continue;
        level--;
      }
      returnValue.push({
        ...out,
        level,
      })
    }
    return returnValue;
  }

  isExtremeForContinueLevel(level: number): boolean {
    if (level <= 1) return true;
    return super.isExtremeForContinueLevel(level - 1);
  }

  @computed get hasContinue() {
    const skewerOuts = super.getIconOutLines();
    return skewerOuts.findIndex((item) => item.type === 'continue' && item.level === 1) !== -1;
  }

  @computed get myContinueOutline(): IIconOutLine | null {
    const skewerOuts = super.getIconOutLines();
    const outline = skewerOuts.find((item) => item.type === 'continue' && item.level === 1)
    return outline ?? null;
  }

  get notMyContinueOutlines(): IIconOutLine[] {
    const skewerOuts = super.getIconOutLines();
    return skewerOuts.filter((item) => item.type === 'continue' && item.level > 1)
  }


  @computed get verticalContinueLineX(): number | null {
    const myContinueOutline = this.myContinueOutline;
    return myContinueOutline?.x ?? null;
  }

  @computed get continueLineLastX(): number {
    return this.getContinueLineLastX();
  }

  protected getContinueLineLastX(): number {
    return this.position.x;
  }

  @computed get continueLineLastY(): number {
    return this.getContinueLineLastY();
  }

  protected getContinueLineLastY(): number {
    return this.position.y;
  }

  protected getRightSize(): number {
    return this.skewer.shape.rightSize;
  }

  getCycleDepth(): number {
    return super.getCycleDepth() + 1;
  }
}