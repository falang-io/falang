import { action, computed, makeObservable, observable } from 'mobx'
import { IconStore } from '../../icons/base/Icon.store'
import { IIconList, TIconListType } from '../../icons/base/IIconList'
import { IIconOutLine, IThreadsOutItem, TIconOutLineType } from '../outs/TOutType'
import { SchemeStore } from '../../store/Scheme.store'
import { IValencePointsRegisterItem } from '../../store/ValencePointsRegisterer.store'
import { CELL_HALF, CELL_SIZE, THREADS_MARGIN } from '../constants'
import { IHorisonatalLine, IVericalLine } from '../ILine'
import { IconWithSkewerStore } from '../skewer/IconWithSkewer.store'
import { typeOrder } from '../skewer/Skewer.store'
import { getComputedValue } from '../store/getComputedValue'
import { PositionStore } from '../store/Position.store'
import { ShapeStore } from '../store/Shape.store'
import { TPath } from '../TPath'
import { TComputedProperty, TNumberComputed } from '../types/TComputedProperty'
import { calculateExtendedOutlines, IIconOutlineExtended } from './calculateExtendedOutlines'
import { SingleThreadIconStore } from './SignleThreadIcon.store'

export type TVerticalAlign = 'top' | 'bottom';

export interface IThreadsStoreParams<TChildIcon extends SingleThreadIconStore = SingleThreadIconStore> {
  children: TChildIcon[]
  editable: boolean
  parentId: string;
  scheme: SchemeStore;
  canHaveOutlines: boolean
  disableOutlines?: boolean
  gaps: number[]
  /**
   * Default: top
   */
  verticalAlign?: TVerticalAlign
}

export class ThreadsStore<TChildIcon extends SingleThreadIconStore = SingleThreadIconStore> implements IIconList<TChildIcon> {
  readonly position = new PositionStore();
  readonly shape = new ShapeStore();
  readonly editable: boolean;
  readonly parentId: string;
  canHaveOutlines: boolean
  readonly scheme: SchemeStore;
  readonly gaps = observable<number>([]);
  private readonly disableOutlines: boolean;
  @observable.ref valencePointY: TNumberComputed = 0;
  @observable.ref gapControlsY: TNumberComputed = 0;
  protected readonly _threads = observable<TChildIcon>([]);
  @observable minimalSecondDx: TComputedProperty = 0;
  readonly verticalAlign: TVerticalAlign

  constructor(params: IThreadsStoreParams<TChildIcon>) {
    this.editable = params.editable;
    this.parentId = params.parentId;
    this.canHaveOutlines = params.canHaveOutlines;
    this.splice(0, 0, params.children);    
    this.scheme = params.scheme;
    this.disableOutlines = !!params.disableOutlines;
    this.verticalAlign = params.verticalAlign ?? 'top';
    this.gaps.replace(params.gaps);
    makeObservable(this);
    this.scheme.sheduleCallback.add(() => this.setPositions());
  }

  setPositions() {
    this.shape.setSize({
      leftSize: () => {
        if(this.icons.length === 0) return 0;
        return this.icons[0].shape.leftSize;
      },
      rightSize: () => {
        if(this.icons.length === 0) return 0;
        const lastIcon = this.icons[this.size - 1];        
        return lastIcon.shape.rightSize + lastIcon.position.x - this.position.x; 
      },
      height: () => this.iconsMaxHeight + this.extraHeigth,
    }); 
    this.updateChildPositions();
  }

  getIconIndex(iconId: string): number {
    return this.icons.findIndex((icon) => icon.id === iconId);
  }

  @computed get iconsMaxHeight() {
    return Math.max(0, ...this.icons.map((icon => icon.shape.height)));
  }

  get icons(): ReadonlyArray<TChildIcon> {
    return this._threads;
  }

  get size(): number {
    return this._threads.length;
  }

  getAtIndex(index: number): TChildIcon | undefined {
    return this._threads[index];
  }

  @action splice(index: number, deleteCount?: number, newItems?: TChildIcon[]): TChildIcon[] {
    newItems?.forEach((item) => {
      item.parentId = this.parentId;
    });
    const spliced = this._threads.spliceWithArray(index, deleteCount, newItems);
    this.updateChildPositions(index);
    spliced.forEach(item => item.position.reset());
    return spliced;
  }  

  @action private updateChildPositions(startIndex = 0) {
    let prevIcon: IconStore | null = (startIndex === 0) ? null : this._threads[startIndex - 1];
    const length = this._threads.length;
    for (let i = startIndex; i < length; i++) {
      const index = i;
      const currentIcon: IconStore = this._threads[i];
      if(currentIcon instanceof IconWithSkewerStore) {
        currentIcon.skewer.isFirst = i === 0;
        currentIcon.skewer.isLast = i === length - 1;
      }
      const isSecond = i === 1;
      if (!prevIcon) {
        currentIcon.position.setPosition({
          x: () => this.position.x,
          y: () => {
            if(this.verticalAlign === 'top') {
              return this.position.y;
            }
            return this.position.y + this.iconsMaxHeight - currentIcon.shape.height;
          },
        });
      } else {
        const currentPrevIcon = prevIcon;
        currentIcon.position.setPosition({
          x: () => {
            let x = currentPrevIcon.position.x + currentPrevIcon.shape.rightSize + currentIcon.shape.leftSize + THREADS_MARGIN;
            if(isSecond) {
              x = Math.max(
                this.position.x + getComputedValue(this.minimalSecondDx, 0),
                x + (this.gaps[0] ?? 0) * CELL_SIZE,
              );
            } else if(index > 1) {
              x += (this.gaps[index - 1] ?? 0) * CELL_SIZE;
            }
            return x;
          },
          y: () => {
            if(this.verticalAlign === 'top') {
              return this.position.y;
            }
            return this.position.y + this.iconsMaxHeight - currentIcon.shape.height;
          },
        });
      }
      prevIcon = currentIcon;
    }
  }

  @action push(...args: TChildIcon[]): void {
    this.splice(this._threads.length, 0, args);
  }

  @action remove(index: number): void {
    this.splice(index, 1);
  }

  @action removeIcon(thread: IconStore): void {
    const index = this._threads.findIndex(item => item.id === thread.id);
    if (index === -1) {
      throw new Error(`Thread #${thread.id} not found`);
    }
    this.remove(index);
  }

  @action deleteIcon(thread: IconStore) {
    this.removeIcon(thread);
    thread.dispose();
  }

  getType(): TIconListType {
    return 'threads';
  }

  @computed get lastIconX() {
    const icon = this._threads[this._threads.length - 1];
    if (!icon) return this.position.x;
    return icon.position.x;
  }

  dispose() {
    this._threads.forEach((thread) => thread.dispose());
    this._threads.clear();
    this.shape.dispose();
    this.position.dispose();
  }

  @computed get iconsIds(): string[] {
    return this._threads.map(icon => icon.id);
  }

  @computed.struct get valencePoints(): IValencePointsRegisterItem[] {
    if (!this.editable || this.scheme.getIsIconIsInSelected(this.parentId)) return [];
    const returnValue: IValencePointsRegisterItem[] = [];
    this.icons.forEach((icon, index) => {
      returnValue.push({
        id: `vp-${this.parentId}-${icon.id}`,
        index,
        parentId: this.parentId,
        type: 'in-switch',
        x: icon.block.position.x + (index > 0 ? -CELL_HALF : CELL_HALF),
        y: getComputedValue(this.valencePointY, this.position.y),
      });
    });
    const index = this.icons.length;
    const lastIcon = this.icons[this.icons.length - 1];
    returnValue.push({
      id: `vp-${this.parentId}-last`,
      index,
      parentId: this.parentId,
      type: 'in-switch',
      x: lastIcon ? lastIcon.block.position.x + lastIcon.block.shape.width - CELL_HALF : this.position.x + this.shape.rightSize - CELL_HALF,
      y: getComputedValue(this.valencePointY, this.position.y),
    });
    return returnValue;
  }

  /**
   * All outlines from child icons
   */
  @computed.struct get totalOutLines(): IIconOutLine[] {
    if(this.disableOutlines) return [];
    let returnValue: IIconOutLine[] = this.icons.map((icon) => icon.iconOutLines).flat();
    if(!this.canHaveOutlines) returnValue = returnValue.filter(out => out.type === 'main');
    returnValue.sort((a, b) => a.x - b.x);
    return returnValue;
  }

  @computed.struct get totalOutlinesExtended(): IIconOutlineExtended[] {
    if(this.disableOutlines) return [];
    return calculateExtendedOutlines(this.totalOutLines);
  }

  @computed.struct get horizontalLines(): IHorisonatalLine[] {
    if(this.disableOutlines) return [];
    const wasItems = new Set<string>();
    const returnValue: IHorisonatalLine[] = [];
    const extendedOutlines = this.totalOutlinesExtended;
    for(let i = 0; i < extendedOutlines.length; i++) {
      const extItem = extendedOutlines[i];
      if(extItem.outLine.type === 'throw') continue;
      const item = extItem.outLine;
      const hash = `${item.type}${item.level}`;
      if(wasItems.has(hash)) continue;
      wasItems.add(hash);
      let currentX = item.x;
      let wasShoe = false;
      const y = extItem.finalY;
      for(let j = i + 1; j < extendedOutlines.length && currentX < extItem.finishX; j++) {
        const currentExtItem = extendedOutlines[j];
        if(currentExtItem.outLine.type === 'throw') continue;
        if(currentExtItem.order === extItem.order) {          
          returnValue.push({
            nextShoe: false,
            shoe: wasShoe,
            targetId: extItem.outLine.targetId,
            type: extItem.outLine.type,
            x1: currentX,
            x2: currentExtItem.outLine.x,
            y,
          });
          currentX = currentExtItem.outLine.x;
          wasShoe = false;
          continue;
        }
        if(currentExtItem.finalY > y) {
          returnValue.push({
            nextShoe: true,
            shoe: wasShoe,
            targetId: extItem.outLine.targetId,
            type: extItem.outLine.type,
            x1: currentX,
            x2: currentExtItem.outLine.x,
            y,
          });
          currentX = currentExtItem.outLine.x;
          wasShoe = true;
        }
      }
      if(currentX < extItem.finishX) {
        returnValue.push({
          nextShoe: false,
          shoe: wasShoe,
          targetId: extItem.outLine.targetId,
          type: extItem.outLine.type,
          x1: currentX,
          x2: extItem.finishX,
          y,
        });
      }
    }
    return returnValue;
  }

  @computed get extraHeigth(): number {
    if(this.disableOutlines) return 0;
    const maxY = this.position.y + this.iconsMaxHeight;
    const maxExtraHeight = Math.max(
      0,
      ...this.totalOutlinesExtended.map((outline) => outline.finalY - maxY),
    );
    return maxExtraHeight;
  }

  @computed.struct get verticalLines(): IVericalLine[] {
    if(this.disableOutlines) return [];
    const extended = this.totalOutlinesExtended;
    const returnValue = extended.filter((ext) => ext.outLine.type !== 'throw').map((ext, index) => {
      const returnValue: IVericalLine = {
        targetId: ext.outLine.targetId,
        type: ext.outLine.type,
        x: ext.outLine.x,
        y1: ext.outLine.y,
        y2: index > 0 ? ext.finalY : this.position.y + this.iconsMaxHeight + this.extraHeigth,
      }
      return returnValue;
    });
    return returnValue;
  }

  getIconOutLines(): IIconOutLine[] {
    if(this.disableOutlines) return [];
    const wasItems = new Set<string>();
    const returnValue: IIconOutLine[] = [];
    const extendedOutlines = this.totalOutlinesExtended;
    for(let i = 0; i < extendedOutlines.length; i++) {
      const extItem = extendedOutlines[i];
      const item = extItem.outLine;
      if(item.type == 'main') continue;
      const hash = `${item.type}${item.level}`;
      if(wasItems.has(hash)) continue;
      wasItems.add(hash);
      returnValue.push({
        level: item.level,
        targetId: item.targetId,
        type: item.type,
        x: extItem.finishX,
        y: extItem.finalY,
        sourceId: extItem.outLine.sourceId,
      });
    }
    return returnValue;    
  }

  @computed get showGapControls() {
    let returnValue = false;
    this.icons.forEach((icon) => {
      returnValue = returnValue || icon.shape.height > CELL_SIZE * 2;
    })
    return returnValue;
  }

  @computed get gapControlsXPositions(): IGapControlXPosition[] {
    const gaps = this.gaps.slice();
    const icons = this.icons;
    const length = icons.length;
    const returnValue: IGapControlXPosition[] = [];
    icons.forEach((icon, index) => {
      if(index === length - 1) return;
      returnValue.push({
        x: icon.position.x + icon.shape.rightSize,
        width: gaps[index] ?? 0,
      });
    })
    return returnValue;
  }
}


export interface IUniqueOutLineItem {
  type: TIconOutLineType
  lines: { [level: number]: IIconOutLine[] }
}

interface IGapControlXPosition {
  x: number
  width: number
}


const order = <T>(unordered: any): T => Object.keys(unordered).sort().reduce(
  (obj, key) => {
    obj[key] = unordered[key];
    return obj;
  },
  {} as any
);