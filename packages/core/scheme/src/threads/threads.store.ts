import { action, computed, makeObservable, observable } from 'mobx';
import { FlowNodeStore } from '../store/flow-node.store.js';
import type { IconStore } from '../store/icon.store.js';
import type { IIconList, TIconListType } from '../types/icon-list.js';
import type { IIconOutLine, TIconOutLineType } from '../types/icon-outline.js';
import { DEFAULT_NUMBER_COMPUTED, type TNumberComputed } from '../types/computed-value.js';
import { updateThreadsChildPositions } from './update-threads-child-positions.js';
import type { IValencePoint } from '../types/valence-point-item.js';
import { CELL_HALF, CELL_SIZE_2 } from '../constants.js';
import type { IIconOutlineExtended } from './calculate-extended-outlines.js';
import { calculateExtendedOutlines } from './calculate-extended-outlines.js';
import type { IHorisontalLine } from '../types/horizontal-line.js';
import { getThreadsHorizontalLines } from './get-threads-horizontal-lines.js';
import type { IVerticalLine } from '../types/vertical-line.js';
import { getThreadsIconOutlines } from './get-threads-icon-outlines.js';
import { checker } from '../checker.js';

export type TVerticalAlign = 'top' | 'bottom';

export interface IThreadsStoreParams {
  canHaveOutlines?: boolean;
  disableOutlines?: boolean;
  hideValencePoints?: boolean;
  gaps?: number[];
  /**
   * Default: top
   */
  verticalAlign?: TVerticalAlign;
}

export class ThreadsStore extends FlowNodeStore implements IIconList {
  canHaveOutlines: boolean;
  readonly gaps = observable<number>([]);
  readonly disableOutlines: boolean;
  readonly hideValencePoints: boolean;
  @observable.ref valencePointY: TNumberComputed = DEFAULT_NUMBER_COMPUTED;
  @observable.ref gapControlsY: TNumberComputed = DEFAULT_NUMBER_COMPUTED;
  protected readonly _threads = observable<IconStore>([]);
  @observable minimalSecondDx: TNumberComputed = DEFAULT_NUMBER_COMPUTED;
  readonly verticalAlign: TVerticalAlign;
  @observable parent: IconStore | null = null;

  constructor(params?: IThreadsStoreParams) {
    super();
    this.canHaveOutlines = params?.canHaveOutlines ?? true;
    this.disableOutlines = Boolean(params?.disableOutlines);
    this.verticalAlign = params?.verticalAlign ?? 'top';
    this.gaps.replace(params?.gaps ?? []);
    this.hideValencePoints = Boolean(params?.hideValencePoints);
    makeObservable(this);
    this.resetShape();
  }

  @computed get parentId(): string {
    return this.parent?.id ?? '';
  }

  replace(icons: IconStore[]): void {
    this._threads.replace(icons);
  }

  resetShape() {
    this.updateChildPositions();
  }

  getIconIndex(iconId: string): number {
    return this.icons.findIndex((icon) => icon.id === iconId);
  }

  @computed get iconsMaxHeight() {
    return Math.max(0, ...this.icons.map((icon) => icon.height));
  }

  get icons(): readonly IconStore[] {
    return this._threads;
  }

  get size(): number {
    return this._threads.length;
  }

  getAtIndex(index: number): IconStore | undefined {
    return this._threads[index];
  }

  @action splice(index: number, deleteCount?: number, newItems?: IconStore[]): IconStore[] {
    newItems?.forEach((item) => {
      item.parent = this.parent;
    });
    const spliced = this._threads.spliceWithArray(index, deleteCount, newItems);
    this.updateChildPositions(index);
    spliced.forEach((item) => item.resetShape());
    return spliced;
  }

  @action private updateChildPositions(startIndex = 0) {
    updateThreadsChildPositions(this, startIndex);
  }

  @action push(...args: IconStore[]): void {
    this.splice(this._threads.length, 0, args);
  }

  @action remove(index: number): void {
    this.splice(index, 1);
  }

  @action removeIcon(thread: IconStore): void {
    const index = this._threads.findIndex((item) => item.id === thread.id);
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
    const icon = this._threads.at(-1);
    if (!icon) return this.x;
    return icon.x;
  }

  dispose() {
    super.dispose();
    this._threads.forEach((thread) => thread.dispose());
    this._threads.clear();
  }

  @computed get iconsIds(): string[] {
    return this._threads.map((icon) => icon.id);
  }

  @computed.struct get valencePoints(): IValencePoint[] {
    if (this.hideValencePoints) return [];
    const returnValue: IValencePoint[] = [];
    this.icons.forEach((icon, index) => {
      returnValue.push({
        id: `vp-${this.parentId}-${icon.id}`,
        index,
        parentId: this.parentId,
        type: 'in-switch',
        x: icon.x - Math.round(icon.blockWidth / 2) + (index > 0 ? -CELL_HALF : CELL_HALF),
        y: this.valencePointY(),
      });
    });
    const index = this.icons.length;
    const lastIcon = this.icons.at(-1);
    returnValue.push({
      id: `vp-${this.parentId}-last`,
      index,
      parentId: this.parentId,
      type: 'in-switch',
      x: lastIcon ? lastIcon.x + Math.round(lastIcon.blockWidth / 2) - CELL_HALF : this.x + this.right - CELL_HALF,
      y: this.valencePointY(),
    });
    return returnValue;
  }

  /**
   * All outlines from child icons
   */
  @computed.struct get totalOutLines(): IIconOutLine[] {
    if (this.disableOutlines) return [];
    let returnValue: IIconOutLine[] = this.icons.flatMap((icon) =>
      checker.isWithList(icon) ? icon.list.outLines : [],
    );
    if (!this.canHaveOutlines) returnValue = returnValue.filter((out) => out.type === 'main');
    returnValue.sort((a, b) => a.x - b.x);
    return returnValue;
  }

  @computed.struct get totalOutlinesExtended(): IIconOutlineExtended[] {
    if (this.disableOutlines) return [];
    return calculateExtendedOutlines(this.totalOutLines);
  }

  @computed.struct get horizontalLines(): IHorisontalLine[] {
    return getThreadsHorizontalLines(this);
  }

  @computed get extraHeigth(): number {
    if (this.disableOutlines) return 0;
    const maxY = this.y + this.iconsMaxHeight;
    const maxExtraHeight = Math.max(0, ...this.totalOutlinesExtended.map((outline) => outline.finalY - maxY));
    return maxExtraHeight;
  }

  @computed.struct get verticalLines(): IVerticalLine[] {
    if (this.disableOutlines) return [];
    const extended = this.totalOutlinesExtended;
    const returnValue = extended
      .filter((ext) => ext.outLine.type !== 'throw')
      .map((ext, index) => {
        const returnValue1: IVerticalLine = {
          targetId: ext.outLine.targetId,
          type: ext.outLine.type,
          x: ext.outLine.x,
          y1: ext.outLine.y,
          y2: index > 0 ? ext.finalY : this.y + this.iconsMaxHeight + this.extraHeigth,
        };
        return returnValue1;
      });
    return returnValue;
  }

  @computed get outLines(): IIconOutLine[] {
    return getThreadsIconOutlines(this);
  }

  @computed get showGapControls() {
    let returnValue = false;
    this.icons.forEach((icon) => {
      returnValue = returnValue || icon.height > CELL_SIZE_2;
    });
    return returnValue;
  }

  @computed get gapControlsXPositions(): IGapControlXPosition[] {
    const gaps = [...this.gaps];
    const icons = this.icons;
    const length = icons.length;
    const returnValue: IGapControlXPosition[] = [];
    icons.forEach((icon, index) => {
      if (index === length - 1) return;
      returnValue.push({
        x: icon.x + icon.right,
        width: gaps[index] ?? 0,
      });
    });
    return returnValue;
  }

  @computed get left(): number {
    if (this.icons.length === 0) return 0;
    return this.icons[0].left;
  }
  @computed get right(): number {
    if (this.icons.length === 0) return 0;
    const lastIcon = this.icons[this.size - 1];
    return lastIcon.right + lastIcon.x - this.x;
  }
  @computed get height(): number {
    return this.iconsMaxHeight + this.extraHeigth;
  }
}

export interface IUniqueOutLineItem {
  type: TIconOutLineType;
  lines: Record<number, IIconOutLine[]>;
}

interface IGapControlXPosition {
  x: number;
  width: number;
}
