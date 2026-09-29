import { action, computed, makeObservable, observable } from 'mobx';
import { FlowNodeStore } from '../store/flow-node.store.js';
import type { IconStore } from '../store/icon.store.js';
import type { IIconList, TIconListType } from '../types/icon-list.js';
import { CELL_HALF, CELL_SIZE } from '../constants.js';
import type { IVerticalLine } from '../types/vertical-line.js';
import type { IHorisontalLine } from '../types/horizontal-line.js';
import type { IValencePoint } from '../types/valence-point-item.js';
import type { ISkewerOutlineExtended } from './calculate-skewer-extended-outlines.js';
import { calcualteSkewerExtendedOutlines } from './calculate-skewer-extended-outlines.js';
import { getSkewerVerticalLines } from './get-skewer-vertical-lines.js';
import { getSkewerHorisontalLines } from './get-skewer-horisontal-lines.js';
import type { IIconOutLine } from '../types/icon-outline.js';
import { getSkewerOutLines } from './get-skewer-outlines.js';
import type { OutIconStore } from '../icons/out/out.icon.store.js';
import { checker } from '../checker.js';

export interface ISkewerBaseParams {
  hideValancePoints?: boolean;
  hideEnds?: boolean;
}

export interface ISkewerConstructorParams extends ISkewerBaseParams {
  parent: IconStore;
}

export class SkewerStore extends FlowNodeStore implements IIconList {
  private readonly _icons = observable<IconStore>([]);
  @observable isFirst = true;
  @observable isLast = false;
  readonly hideValencePoints: boolean;
  readonly hideEnds: boolean;
  readonly parent: IconStore;

  @observable.ref out: OutIconStore | null = null;

  constructor(params: ISkewerConstructorParams) {
    super();
    makeObservable(this);
    this.hideValencePoints = Boolean(params.hideValancePoints);
    this.hideEnds = Boolean(params.hideEnds);
    this.parent = params.parent;
  }

  replace(icons: IconStore[]): void {
    this._icons.replace(icons);
  }

  get parentId() {
    return this.parent?.id ?? null;
  }

  get icons(): readonly IconStore[] {
    return this._icons;
  }

  get size(): number {
    return this._icons.length;
  }

  @computed get maxIconsRightSize() {
    return Math.max(...this.icons.map((icon) => icon.right), this.out?.right ?? 0);
  }

  @computed get extraRightSize() {
    const maxX = this.x + this.maxIconsRightSize;
    const maxOutlinesX = Math.max(maxX, ...this.baseOutLines.map((out) => out.x));
    return maxOutlinesX - maxX;
  }

  getAtIndex(index: number): IconStore | undefined {
    return this._icons[index];
  }

  @action splice(index: number, deleteCount?: number, newItems?: IconStore[]): IconStore[] {
    newItems?.forEach((item) => {
      item.parent = this.parent;
    });
    const spliced = this._icons.spliceWithArray(index, deleteCount, newItems);
    this.updateChildPositions(index);
    spliced.forEach((item) => {
      item.resetShape();
      item.parent = null;
    });
    return spliced;
  }

  @action private updateChildPositions(startIndex = 0) {
    let prevIcon: IconStore | null = startIndex === 0 ? null : this._icons[startIndex - 1];
    for (let i = startIndex; i < this._icons.length; i += 1) {
      const currentIcon: IconStore = this._icons[i];
      if (prevIcon) {
        const currentPrevIcon = prevIcon;
        currentIcon.setPosition({
          x: () => this.x,
          y: () => currentPrevIcon.y + currentPrevIcon.height + CELL_SIZE,
        });
      } else {
        currentIcon.setPosition({
          x: () => this.x,
          y: () => this.y + CELL_SIZE,
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
    return this._icons.map((icon) => icon.id);
  }

  @action removeIcon(icon: IconStore): void {
    const index = this._icons.findIndex((item) => item.id === icon.id);
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
    this.out?.dispose();
  }

  @action setOutStore(store: OutIconStore) {
    if (this.out) {
      this.removeOutStore();
    }
    this.out = store;
    this.out.setParent(this.parent);
    this.out.setPosition({
      x: () => this.x,
      y: () => this.y + this.iconsHeightSum,
    });
  }

  @action removeOutStore() {
    const store = this.out;
    if (!store) return;
    this.out = null;
    store.dispose();
  }

  resetShape(): void {
    this.updateChildPositions();
  }

  @computed get left() {
    return Math.max(...this.icons.map((icon) => icon.left), this.out?.left ?? 0) ?? 0;
  }

  @computed get right() {
    return this.maxIconsRightSize + this.extraRightSize;
  }

  @computed get height() {
    if (this.isCollapsed) return 0;
    const outHeight = this.out?.height ?? 0;
    return this.iconsHeightSum + outHeight;
  }

  @computed get iconsHeightSum(): number {
    if (this.isCollapsed) return 0;
    let iconsHeightSum = 0;
    this.icons.forEach((icon) => {
      iconsHeightSum += icon.height;
    });
    return this.icons.length * CELL_SIZE + iconsHeightSum + CELL_SIZE;
  }

  @computed.struct get valencePoints(): IValencePoint[] {
    if (this.hideValencePoints) return [];
    const returnValue: IValencePoint[] = [];
    this.icons.forEach((icon, index) => {
      returnValue.push({
        id: `vp-${this.parent.id}-${index}`,
        index,
        parentId: this.parent.id,
        type: 'in-skewer',
        x: icon.x,
        y: icon.y - CELL_HALF,
      });
    });
    const index = this.icons.length;
    returnValue.push({
      id: `vp-${this.parent.id}-${index}`,
      index,
      parentId: this.parent.id,
      type: 'in-skewer',
      x: this.x,
      y: this.y + this.iconsHeightSum - CELL_HALF,
    });
    return returnValue;
  }

  @computed get skewerDy(): number {
    return this.y - this.y;
  }

  @computed get skewerDx(): number {
    return this.x - this.x;
  }

  @computed get outIconLeftSize(): number {
    return this.out?.left ?? 0;
  }

  @computed get outIconRightSize(): number {
    return this.out?.right ?? 0;
  }

  @computed get outIconHeight(): number {
    return this.out?.height ?? 0;
  }

  @computed get totalOutlinesExtended(): ISkewerOutlineExtended[] {
    return calcualteSkewerExtendedOutlines(this);
  }

  @computed get verticalLines(): IVerticalLine[] {
    return getSkewerVerticalLines(this);
  }

  @computed get horizontalLines(): IHorisontalLine[] {
    return getSkewerHorisontalLines(this);
  }

  @computed get baseOutLines(): IIconOutLine[] {
    return getSkewerOutLines(this);
  }

  @computed get outLines(): IIconOutLine[] {
    const outLines = this.baseOutLines;
    if (!checker.isCycle(this.parent)) return outLines;
    const returnValue: IIconOutLine[] = [];
    for (const out of outLines) {
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

  @computed get isCollapsed() {
    return this.size === 0 && this.out && this.out.height === 0;
  }

  getIconIndex(iconId: string): number {
    return this.icons.findIndex((icon) => icon.id === iconId);
  }

  getType(): TIconListType {
    return 'skewer';
  }

  @computed get hasOutError(): boolean {
    return this.isFirst && Boolean(this.out);
  }
}
