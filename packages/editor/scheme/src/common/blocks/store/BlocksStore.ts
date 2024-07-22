import { computed, makeObservable, observable, reaction } from 'mobx';
import type { SchemeStore } from '../../../store/Scheme.store';
import { ShapeStore } from '../../store/Shape.store';
import { PositionStore } from '../../store/Position.store';
import { BlockDto } from '../Block.dto';
import { BlockTransformer } from '../Block.transformer';
import { CELL_SIZE } from '../../constants';
import { IBlockInBlock } from '../../IBlockInBlock';
import { IBlockLine } from '../../IBlockLine';
import { IBlockBadge } from '../../IBlockBadge';

export type IBlockStoreParams = ({
  id: string
  scheme: SchemeStore
  transformer: BlockTransformer<any, any>
  colorEditable?: boolean
  minWidth?: number
  maxWidth?: number
  /**
   * default true
   */
  editable?: boolean

  title?: string
  titleDx?: number
} & BlockDto)

export class BlockStore {
  readonly shape = new ShapeStore();
  readonly position = new PositionStore();
  readonly scheme: SchemeStore;
  readonly id: string;
  readonly transformer: BlockTransformer<any, any>;
  readonly colorEditable: boolean;
  readonly minWidth: number
  readonly maxWidth: number
  readonly editable: boolean
  readonly title?: string
  readonly titleDx: number

  resizeBarGap = 0;
  @observable width: number;
  @observable color = '#ffffff';

  constructor({
    id,
    scheme,
    width,
    transformer,
    color,
    colorEditable,
    minWidth,
    maxWidth,
    editable,
    title,
    titleDx,
  }: IBlockStoreParams) {
    this.scheme = scheme;
    this.editable = typeof editable === 'boolean' ? editable : true;
    this.id = id;
    this.width = width;
    this.transformer = transformer;
    this.colorEditable = typeof colorEditable === 'boolean' ? colorEditable : true;
    if (color) {
      this.color = color;
    }
    this.minWidth = minWidth ?? CELL_SIZE * 4;
    this.maxWidth = maxWidth ?? CELL_SIZE * 20;
    this.titleDx = titleDx ?? 0;
    this.title = title;
    makeObservable(this);
    this.scheme.sheduleCallback.add(() => this.initShape());
  }

  protected initShape() {
    this.shape.setSize({
      leftSize: () => this.width > 0 ? Math.round(this.width / 2) : 0,
      rightSize: () => this.width > 0 ? Math.round(this.width / 2) : 0,
      height: () => this.getHeight(),
    });
  }

  /**
   * @deprecated
   */
  @computed get halfHeight(): number {
    return this.shape.height > 0 ? Math.round(this.shape.height / 2) : 0;
  }

  protected getHeight(): number {
    return 0;
  }

  dispose() {
    this.shape.dispose();
    this.position.dispose();
    this.getBlocksInBlock().forEach(b => b.dispose());
  }

  onIconDoubleClick(e: React.MouseEvent): void {
    e.stopPropagation();
    this.scheme.editing.startEdit(this.scheme.icons.get(this.id));
  }

  @computed get errors(): string[] {
    return this.getErrors();
  }

  protected getErrors(): string[] {
    return [];
  }

  getErrorsTexts(): string[] {
    const t = this.scheme.frontRoot.lang.t;
    return this.errors.map((e) => {
      const matchItems = e.match(/_\{([^\}]+)\}/g);
      let returnValue = e;
      if(!matchItems) return returnValue;
      for(const item of matchItems) {
        returnValue = returnValue.replace(item, t(item.slice(2, item.length - 1)));
      }
      return returnValue;
    });
  }

  @computed get hasError(): boolean {
    return this.errors.length > 0;
  }

  @computed get isMeUnderEdit() {
    return this.scheme.editing.editingIconId === this.id;
  }

  public beforeEdit(): void {}

  get viewConfig() {
    return this.transformer.viewConfig;
  }

  getBlocksInBlock(): IBlockInBlock<any>[] {
    return [];
  }

  getTranslateValue(): string {
    return `translate(${this.position.x} ${this.position.y})`;
  }

  getBlockLines(): IBlockLine[] | null {
    return null;
  }

  getBlockBadges(): IBlockBadge[] {
    if(this.title) {
      const t = this.scheme.frontRoot.lang.t;
      return [{
        dx: this.titleDx,
        dy: -CELL_SIZE,
        text: t(this.title),
      }]
    }
    return [];
  }

  isHasValue() {
    return true;
  }
}
