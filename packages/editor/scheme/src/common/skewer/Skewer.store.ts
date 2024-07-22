import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { checker } from '../../checker';
import { IHorisontalLine } from '../../cmp/HorisontalLine';
import { IconStore } from '../../icons/base/Icon.store';
import { IIconList, TIconListType } from '../../icons/base/IIconList';
import { IIconOutLine, IThreadsOutItem, TIconOutLineType } from '../outs/TOutType';
import { OutStore } from '../outs/Out.store';
import { SchemeStore } from '../../store/Scheme.store';
import { IValencePointsRegisterItem } from '../../store/ValencePointsRegisterer.store';
import { CELL_HALF, CELL_SIZE } from '../constants';
import { IHorisonatalLine, IVericalLine } from '../ILine';
import { INodeStoreParams, NodeStore } from '../Node.store';
import { PositionStore } from '../store/Position.store';
import { ShapeStore } from '../store/Shape.store';
import { TPath } from '../TPath';
import { calcualteSkewerExtendedOutlines, ISkewerOutlineExtended } from './calculateSkewerExtendedOutlines';

export interface ISkewerStoreParams {
  scheme: SchemeStore
  children: IconStore[]
  hideValancePoints?: boolean
  hideEnds?: boolean
  out?: OutStore
}

export interface ISkewerStoreFullParams extends ISkewerStoreParams {
  parent: IconStore
}

export const typeOrder: TIconOutLineType[] = ['main', 'break', 'return', 'continue'];

export class SkewerStore implements IIconList {
  private readonly _icons = observable<IconStore>([]);
  @observable isFirst = true;
  @observable isLast = false;
  readonly position = new PositionStore();
  readonly shape = new ShapeStore();
  readonly scheme: SchemeStore;
  readonly hideValencePoints: boolean;
  readonly hideEnds: boolean;
  readonly parent: IconStore;
  readonly parentId: string;

  @observable.ref _outStore: OutStore | null = null;

  get outStore(): OutStore | null {
    return this._outStore;
  }

  constructor(params: ISkewerStoreFullParams) {
    makeObservable(this);
    this.scheme = params.scheme;
    this.parent = params.parent;
    this.parentId = params.parent.id;
    this.hideValencePoints = !!params.hideValancePoints;
    this.hideEnds = !!params.hideEnds;
    this._icons.forEach((icon) => icon.setParentId(this.parent.id));
    this.scheme.sheduleCallback.add(() => this.initShape());
    if (params.out) {
      this.setOutStore(params.out);
    }
    runInAction(() => {
      if (params.children) {
        params.children.forEach((child) => child.setParentId(this.parentId));
        this._icons.replace(params.children);
      }
    });
  }

  /*@action private setPositions() {
    this.shape.setSize({
      leftSize: () => Math.max(
        ...this.icons.map(icon => icon.shape.leftSize),
        this.outStore?.shape.leftSize ?? 0,
      ) ?? 0,
      rightSize: () => this.maxIconsRightSize + this.extraRightSize,
      height: () => {
        const sum = this.icons.reduce<number>((prev, icon) => prev + icon.shape.height, 0);
        const outHeight = this.outStore ? this.outStore.shape.height : 0;
        return CELL_SIZE + sum + CELL_SIZE * this.size + outHeight;
      },
    });
    this.updateChildPositions();
  }*/

  get icons(): ReadonlyArray<IconStore> {
    return this._icons;
  }

  get size(): number {
    return this._icons.length;
  }

  @computed get maxIconsRightSize() {
    return Math.max(
      ...this.icons.map(icon => icon.shape.rightSize),
      this.outStore?.shape.rightSize ?? 0,
    );
  }

  @computed get extraRightSize() {
    const maxX = this.position.x + this.maxIconsRightSize;
    const maxOutlinesX = Math.max(
      maxX,
      ...this.getIconOutLines().map(out => out.x),
    );
    return maxOutlinesX - maxX;
  }

  getAtIndex(index: number): IconStore | undefined {
    return this._icons[index];
  }

  @action splice(index: number, deleteCount?: number, newItems?: IconStore[]): IconStore[] {
    newItems?.forEach((item) => {
      item.parentId = this.parent.id;
    });
    const spliced = this._icons.spliceWithArray(index, deleteCount, newItems);
    this.updateChildPositions(index);
    spliced.forEach(item => {
      item.position.reset();
      item.parentId = null;
    });
    return spliced;
  }

  @action private updateChildPositions(startIndex = 0) {
    let prevIcon: IconStore | null = (startIndex === 0) ? null : this._icons[startIndex - 1];
    for (let i = startIndex; i < this._icons.length; i++) {
      const currentIcon: IconStore = this._icons[i];
      if (!prevIcon) {
        currentIcon.position.setPosition({
          x: () => this.position.x,
          y: () => this.position.y + CELL_SIZE,
        });
      } else {
        const currentPrevIcon = prevIcon;
        currentIcon.position.setPosition({
          x: () => this.position.x,
          y: () => currentPrevIcon.position.y + currentPrevIcon.shape.height + CELL_SIZE,
        });
      }
      prevIcon = currentIcon;
    }
  }

  @action push(...args: IconStore[]): void {
    this.splice(this._icons.length, 0, args);
  }

  @action remove(index: number): void {
    this.splice(index, 1);
  }

  @computed.struct get iconsIds(): string[] {
    return this._icons.map(icon => icon.id);
  }

  @action removeIcon(icon: IconStore): void {
    const index = this._icons.findIndex(item => item.id === icon.id);
    if (index === -1) {
      throw new Error(`Icon #${icon.id} not found`);
    }
    this.remove(index);
  }

  @action deleteIcon(icon: IconStore) {
    this.removeIcon(icon);
    icon.dispose();
  }

  dispose() {
    this._icons.forEach((icon) => icon.dispose());
    this._icons.replace([]);
    this.outStore?.dispose();
  }

  @action setOutStore(store: OutStore) {
    if (this._outStore) {
      this.removeOutStore();
    }
    this._outStore = store;
    this._outStore.parentId = this.parentId;
    this._outStore.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.iconsHeightSum,
    });
  }

  @action removeOutStore() {
    const store = this._outStore;
    if (!store) return;
    this._outStore = null;
    store.dispose();
  }

  initShape(): void {
    this.updateChildPositions();
    this.shape.setSize({
      leftSize: () => Math.max(
        ...this.icons.map(icon => icon.shape.leftSize),
        this.outStore?.shape.leftSize ?? 0,
      ) ?? 0,
      rightSize: () => this.maxIconsRightSize + this.extraRightSize,
      height: () => {
        if (this.isCollapsed) return 0;
        const outHeight = this.outStore?.shape.height ?? 0;
        return this.iconsHeightSum + outHeight;
      },
    });
  }

  @computed get iconsHeightSum(): number {
    if (this.isCollapsed) return 0;
    let iconsHeightSum = 0;
    this.icons.forEach(icon => iconsHeightSum += icon.shape.height);
    return this.icons.length * CELL_SIZE + iconsHeightSum + CELL_SIZE;
  }

  @computed.struct get valencePoints(): IValencePointsRegisterItem[] {
    if (this.hideValencePoints || this.parent.isInSelected) return [];
    const returnValue: IValencePointsRegisterItem[] = [];
    this.icons.forEach((icon, index) => {
      returnValue.push({
        id: `vp-${this.parent.id}-${index}`,
        index,
        parentId: this.parent.id,
        type: 'in-skewer',
        x: icon.position.x,
        y: icon.position.y - CELL_HALF
      });
    });
    const index = this.icons.length;
    returnValue.push({
      id: `vp-${this.parent.id}-${index}`,
      index,
      parentId: this.parent.id,
      type: 'in-skewer',
      x: this.position.x,
      y: this.position.y + this.iconsHeightSum - CELL_HALF
    });
    return returnValue;
  }

  @computed get skewerDy(): number {
    return this.position.y - this.position.y;
  }

  @computed get skewerDx(): number {
    return this.position.x - this.position.x;
  }


  @computed get outIconLeftSize(): number {
    return this.outStore?.shape.leftSize ?? 0;
  }

  @computed get outIconRightSize(): number {
    return this.outStore?.shape.rightSize ?? 0;
  }

  @computed get outIconHeight(): number {
    return this.outStore?.shape.height ?? 0;
  }

  @computed get totalOutlinesExtended(): ISkewerOutlineExtended[] {
    return calcualteSkewerExtendedOutlines(this);
  }

  @computed get verticalLines(): IVericalLine[] {
    const wasHash = new Set<string>();
    const extended = this.totalOutlinesExtended;
    const returnValue: IVericalLine[] = [];
    for (let i = 0; i < extended.length; i++) {
      const currentItem = extended[i];
      if(currentItem.outLine.type === 'throw') continue;
      if (wasHash.has(currentItem.hash)) continue;
      wasHash.add(currentItem.hash);
      let minY = currentItem.outLine.y;
      let maxY = currentItem.finalY;
      for (let j = i + 1; j < extended.length; j++) {
        const item = extended[j];
        if (item.order !== currentItem.order) continue;
        minY = Math.min(minY, item.outLine.y);
        maxY = Math.max(maxY, item.finalY);
      }
      if (maxY === minY) continue;
      returnValue.push({
        targetId: currentItem.outLine.targetId,
        type: currentItem.outLine.type,
        x: currentItem.finalX,
        y1: minY,
        y2: maxY,
      })
    }
    returnValue.sort((a, b) => a.x - b.x);
    return returnValue;
  }

  @computed get horizontalLines(): IHorisontalLine[] {
    const extended = this.totalOutlinesExtended;
    const verticalLines = this.verticalLines;
    const returnValue: IHorisonatalLine[] = [];
    extended.forEach((ext) => {
      if(ext.outLine.type === 'throw') return;
      const x1 = ext.outLine.x;
      const x2 = ext.finalX;
      const y = ext.outLine.y;
      const xBetween: number[] = [];
      for (const v of verticalLines) {
        if (v.x <= x1) continue;
        if (v.x >= x2) continue;
        if (y <= v.y1) continue;
        if (y >= v.y2) continue;
        xBetween.push(v.x);
      }
      for (let i = 0; i <= xBetween.length; i++) {
        const lx1 = i === 0 ? x1 : xBetween[i - 1];
        const lx2 = i === xBetween.length ? x2 : xBetween[i];
        const shoe = i > 0;
        const nextShoe = i < xBetween.length;
        returnValue.push({
          targetId: ext.outLine.targetId,
          type: ext.outLine.type,
          x1: lx1,
          y: ext.outLine.y,
          x2: lx2,
          nextShoe,
          shoe,
        });
      }
    });
    return returnValue;
  }

  getIconOutLines(): IIconOutLine[] {
    const returnValue: IIconOutLine[] = [];
    const extended = this.totalOutlinesExtended;
    const wasItems: Record<string, ISkewerOutlineExtended> = {}
    for (let i = extended.length - 1; i >= 0; i--) {
      const item = extended[i];
      if (wasItems[item.hash]) {
        if (item.outLine.type !== 'continue' || item.finalY > wasItems[item.hash].finalY) {
          continue;
        }
        if (!this.parent.isExtremeForContinueLevel(item.outLine.level)) {
          continue;
        }
      }
      wasItems[item.hash] = item;
      returnValue.push({
        level: item.outLine.level,
        targetId: item.outLine.targetId,
        type: item.outLine.type,
        x: item.finalX,
        y: item.finalY,
        sourceId: item.outLine.sourceId,
      })
    }

    const outItem = this.outStore;
    if (outItem && !this.isFirst) {
      returnValue.push({
        level: outItem.outLevel,
        type: outItem.type,
        x: this.position.x,
        y: this.position.y + this.shape.height,
        targetId: outItem.targetId || '',
        sourceId: outItem.id,
      });
    } else {
      returnValue.push({
        level: 1,
        type: 'main',
        x: this.position.x,
        y: this.position.y + this.shape.height,
        targetId: '',
        sourceId: this.parentId,
      });
    }
    return returnValue;
  }

  @computed get isCollapsed() {
    return !this.scheme.isEditing && this.size === 0 && !!this.outStore && !this.outStore.isBlockShape;
  }

  getIconIndex(iconId: string): number {
    return this.icons.findIndex((icon) => icon.id === iconId);
  }

  getType(): TIconListType {
    return 'skewer';
  }

  @computed get hasOutError(): boolean {
    return this.isFirst && !!this.outStore;
  }
}


interface IAllOutlinesItem {
  id: string,
  outLines: IIconOutLine[],
}

