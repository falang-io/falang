import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import type { SchemeStore } from '../../store/Scheme.store';
import type { BlockStore } from '../../common/blocks/store/BlocksStore';
import { ShapeStore } from '../../common/store/Shape.store';
import { PositionStore } from '../../common/store/Position.store';
import type { IIconOutLine, TOutIconType } from '../../common/outs/TOutType';
import { ClassConstructor } from 'class-transformer';
import { NodeStore } from '../../common/Node.store';
import { TPath } from '../../common/TPath';
import { FC } from 'react';
import { EmptyIconStore } from './EmptyIconStore';
import { EmptyIconComponent } from './EmptyIcon.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IconTransformer } from './Icon.transformer';
import { CELL_SIZE } from '../../common/constants';
import { checker } from '../../checker';

export interface IIconParams<TBlockStore extends BlockStore = BlockStore> {
  id: string
  alias?: string
  scheme: SchemeStore
  block: TBlockStore
  transformer: IconTransformer
  leftSide?: IconStore
}

export type IconType<T extends IconStore = IconStore> = { new(...args: any[]): T }


export class IconStore<TBlockStore extends BlockStore = BlockStore> extends NodeStore {
  readonly alias: string;
  readonly block: TBlockStore;
  readonly transformer: IconTransformer;
  @observable leftSideStore: IconStore | null = null;

  constructor({
    alias,
    id,
    scheme,
    block,
    transformer,
    leftSide,
  }: IIconParams<TBlockStore>) {
    super({ id, scheme });
    this.alias = alias ?? 'system';
    this.block = block;
    this.transformer = transformer;
    this.leftSideStore = leftSide ?? null;
    if (this.leftSideStore) {
      this.leftSideStore.setParentId(this.id);
    }

    makeObservable(this);
    this.scheme.icons.add(this);
    this.scheme.sheduleCallback.add(() => this.initShape());
  }

  @computed get parent(): IconStore | null {
    if (!this.parentId) return null;
    return this.scheme.icons.getSafe(this.parentId);
  }

  @action setSideStore(store: IconStore | null) {
    if (this.leftSideStore) {
      this.leftSideStore.dispose();
      this.leftSideStore = null;
    }
    if (store) {
      this.leftSideStore = store;
      store.setParentId(this.id);
      this.initSidePosition();
    }
  }

  @computed protected get leftSideStoreExtraSize(): number {
    return this.leftSideStore?.shape.width ?? 0;
  }

  @action dispose(): void {
    this.parentId = null;
    this.shape.dispose();
    this.position.dispose();
    this.block.dispose();
    this.scheme.icons.remove(this);
  }

  @action extract(): void {
    this.shape.reset();
    this.parentId = null;
  }

  get isSelected(): boolean {
    return this.scheme.selection.isIconSelected(this.id);
  }

  @computed get isInSelected(): boolean {
    return !!(this.isSelected || this.parent?.isInSelected);
  }

  initShape(): void {
    this.initSidePosition();
  }

  @computed get blockClassName(): string {
    return this.getBlockClassName().join(' ');
  }

  protected getBlockClassName(): string[] {
    const returnValue: string[] = ['iconBlock']
    if (this.isSelected) {
      returnValue.push('isSelected isInSelected');
    } else if (this.isInSelected) {
      returnValue.push('isInSelected');
    }
    if(this.block.hasError) {
      returnValue.push('error');
    }
    return returnValue;
  }

  @computed.struct get blockBodyStyles(): React.CSSProperties {
    return this.getBlockBodyStyles();
  }

  protected getBlockBodyStyles(): React.CSSProperties {
    return {
      fill: this.block.color,
    };
  }


  @computed.struct get outsIds(): string[] {
    return this.getOutsIds();
  }

  protected getOutsIds(): string[] {
    return []
  }

  @computed.struct get iconOutLines(): IIconOutLine[] {
    return this.getIconOutLines();
  }

  protected getIconOutLines(): IIconOutLine[] {
    return [];
  }

  /**
   * @deprecated
   */
  @computed.struct get bottomIconOutLines(): IIconOutLine[] {
    return this.getBottomIconOutlines();
  }

  /**
   * @deprecated
   */
  protected getBottomIconOutlines(): IIconOutLine[] {
    const returnValue: IIconOutLine[] = [];
    const outlines = this.iconOutLines;
    outlines.forEach((outline) => {
      if (outline.type !== 'continue' || !this.isExtremeForContinueLevel(outline.level)) {
        returnValue.push(outline);
      }
    });
    return returnValue;
  }

  isExtremeForContinueLevel(level: number, childId?: string): boolean {
    return this.parent?.isExtremeForContinueLevel(level, this.id) ?? false;
  }

  /**
   * @deprecated
   */
  @computed.struct get continueOutsOnRight(): IIconOutLine[] {
    return this.getContinueOutsOnRight();
  }

  /**
   * @deprecated
   */
  protected getContinueOutsOnRight(): IIconOutLine[] {
    return [];
  }

  getParentsByType(...types: IconType<any>[]): IconStore[] {
    return this.getParentsBy((icon) => types.some(t => icon instanceof t));
  }

  getParentsBy(cb: (icon: IconStore) => boolean): IconStore[] {
    let returnValue: IconStore[] = [];
    const parent = this.parent;
    if (!parent) return [];
    if (cb(parent)) {
      returnValue = [parent];
    }
    return returnValue.concat(parent.getParentsBy(cb));
  }

  getCycleDepth(): number {
    const parent = this.parent;
    if (!parent) return 0;
    return parent.getCycleDepth();
  }

  canHaveReturn(): boolean {
    return this.parent?.canHaveReturn() ?? false;
  }

  getReturnDepth(): number {
    return this.parent?.getReturnDepth() ?? 0;
  }

  get outIconType(): TOutIconType | null {
    return null;
  }

  isThreads() {
    return false;
  }

  isIconWithSkewer() {
    return false;
  }

  isOut() {
    return false;
  }

  isIconList() {
    return false;
  }

  isFunction() {
    return false;
  }

  isCycle() {
    return false;
  }

  getRenderer(): TIconRenderer<any> {
    return EmptyIconComponent;
  }

  private initSidePosition() {
    if (!this.leftSideStore) return;
    this.leftSideStore.position.setPosition({
      x: () => this.block.position.x - Math.ceil(this.block.resizeBarGap / CELL_SIZE) * CELL_SIZE,
      y: () => this.block.position.y + Math.floor(this.block.shape.height / CELL_SIZE / 2) * CELL_SIZE
    });
  }

  isInList(): boolean {
    const parent = this.parent;
    if (!parent) return false;
    if (!checker.isIconWithList(parent)) return false;
    return parent.list.iconsIds.includes(this.id);
  }
}
