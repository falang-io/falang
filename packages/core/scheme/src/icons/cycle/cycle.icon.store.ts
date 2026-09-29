import { computed, makeObservable } from 'mobx';
import type { IIconWithSkewerStoreParams } from '../../skewer/icon-with-skewer.store.js';
import { IconWithSkewerStore } from '../../skewer/icon-with-skewer.store.js';
import { CELL_HALF } from '../../constants.js';
import type { IIconOutLine } from '../../types/icon-outline.js';
import { addFlag, IconFlags } from '../../types/icon-flags.js';

export interface CycleIconParams extends IIconWithSkewerStoreParams {
  hideBackArrow?: boolean;
}

export abstract class CycleIconStore extends IconWithSkewerStore {
  readonly hideBackArrow: boolean;

  constructor(params: CycleIconParams) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.Cycle, IconFlags.List),
    });
    this.hideBackArrow = Boolean(params.hideBackArrow);
    makeObservable(this);
  }

  @computed get arrowTopX(): number {
    return this.getArrowTopX();
  }

  protected getArrowTopX(): number {
    return this.x;
  }

  @computed get arrowTopY(): number {
    return this.getArrowTopY();
  }

  protected getArrowTopY(): number {
    return this.y + CELL_HALF;
  }

  @computed get arrowBottomY(): number {
    return this.getArrowBottomY();
  }

  protected getArrowBottomY(): number {
    return this.y + this.height;
  }

  @computed get arrowBottomX(): number {
    return this.getArrowBottomX();
  }

  protected getArrowBottomX(): number {
    return this.x;
  }

  @computed get continueArrowX(): number {
    return this.getContinueArrowX();
  }

  protected getContinueArrowX(): number {
    return this.x;
  }

  @computed get breakArrowX(): number {
    return this.getBreakArrowX();
  }

  protected getBreakArrowX(): number {
    return this.x;
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
    if (breakLines.length === 0) return 0;
    return breakLines[0].x;
  }

  @computed get verticalBrakeLineY(): number {
    const breakLines = this.myBreaksLines;
    if (breakLines.length === 0) return 0;
    return breakLines[0].y;
  }
  /*
    protected getOutsIds(): string[] {
      const skewerOutsIds = this.outsIds;
      const returnIds = skewerOutsIds.filter((outId) => {
        const icon = this.registry.get(outId) as OutStore;
        const targetCycleId = icon.targetId;
        return targetCycleId !== this.id;
      })
      return returnIds;
    }
  */
  /**
   * Must read `baseOutLines`, not `outLines`: a cycle's own skewer strips level-1 `break`/`continue`
   * out of `outLines` (they end at this loop and must not propagate further up), so reading it here
   * always came back empty and the break line to the loop exit was never drawn.
   */
  @computed.struct get myBreaksLines(): IIconOutLine[] {
    const returnValue: IIconOutLine[] = [];
    const skewerOuts = this.list.baseOutLines;
    skewerOuts.forEach((outline) => {
      if (outline.type === 'break' && outline.level === 1) {
        returnValue.push(outline);
      }
    });
    returnValue.sort((a, b) => b.y - a.y);
    return returnValue;
  }

  @computed.struct get notMyBreakLines(): IIconOutLine[] {
    const returnValue: IIconOutLine[] = [];
    const skewerOuts = this.list.baseOutLines;
    skewerOuts.forEach((outline) => {
      if (outline.type !== 'break' || outline.level !== 1) {
        returnValue.push(outline);
      }
    });
    return returnValue;
  }

  @computed get hasBreak(): boolean {
    return this.myBreaksLines.length > 0;
  }

  getIconOutLines(): IIconOutLine[] {
    const parentOutlines = this.list.baseOutLines;
    const returnValue: IIconOutLine[] = [];
    for (const out of parentOutlines) {
      let level = out.level;
      if (out.type === 'break' || out.type === 'continue') {
        if (level === 1) continue;
        level -= 1;
      }
      returnValue.push({
        ...out,
        level,
      });
    }
    return returnValue;
  }

  @computed get hasContinue() {
    const skewerOuts = this.list.baseOutLines;
    return skewerOuts.some((item) => item.type === 'continue' && item.level === 1);
  }

  @computed get myContinueOutline(): IIconOutLine | null {
    const skewerOuts = this.list.baseOutLines;
    const outline = skewerOuts.find((item) => item.type === 'continue' && item.level === 1);
    return outline ?? null;
  }

  get notMyContinueOutlines(): IIconOutLine[] {
    const skewerOuts = this.list.outLines;
    return skewerOuts.filter((item) => item.type === 'continue');
  }

  @computed get verticalContinueLineX(): number | null {
    const myContinueOutline = this.myContinueOutline;
    return myContinueOutline?.x ?? null;
  }

  @computed get continueLineLastX(): number {
    return this.getContinueLineLastX();
  }

  protected getContinueLineLastX(): number {
    return this.x;
  }

  @computed get continueLineLastY(): number {
    return this.getContinueLineLastY();
  }

  protected getContinueLineLastY(): number {
    return this.y;
  }

  protected getRightSize(): number {
    return this.skewer.right;
  }
}
