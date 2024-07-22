import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { checker } from '@falang/editor-scheme';
import { BlockStore, IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE, CELL_SIZE_2, FONT_SIZE, LINE_HEIGHT } from '@falang/editor-scheme';
import { fontFamily } from '@falang/editor-scheme';
import { Text2Store } from '../../store/Text2.store';
import { LifeGramFunctionFooterBlockDto } from './LifeGramFunctionFooter.block.dto';

export interface LifeGramFunctionFooterBlockStoreParams extends IBlockStoreParams, LifeGramFunctionFooterBlockDto { }

interface ISelectOption {
  id: string
  name: string
}

export class LifeGramFunctionFooterBlockStore extends BlockStore {
  @observable targetIcon: string;
  readonly textStore: Text2Store;

  constructor(params: LifeGramFunctionFooterBlockStoreParams) {
    super(params);
    this.targetIcon = params.targetIcon ?? '';
    makeObservable(this);
    this.textStore = new Text2Store({
      scheme: params.scheme,
      computedText: () => this.targetText,
    })
  }

  @computed get selectOptions(): ISelectOption[] {
    const root = this.scheme.root;
    if (!checker.isLifeGramStore(root)) return [];
    return root.footerSelectOptions;
  }

  @computed get targetText(): string {
    const targetIconId = this.targetIcon;
    const foundIcon = this.selectOptions.find((item) => item.id === targetIconId);
    if(!foundIcon) return '';
    return foundIcon.name;
  }

  @computed.struct get selectStyle(): React.CSSProperties {
    const { x, y, scale } = this.scheme.viewPosition;
    const textX = this.position.x;
    const fontSize = FONT_SIZE * scale;
    const height = CELL_SIZE * scale;
    const textY = this.position.y + Math.round((this.shape.height - CELL_SIZE) / 2);
    const left = x + textX * scale;
    const top = y + textY * scale;
    const lineHeight = LINE_HEIGHT * (scale * 1.2);
    const width = this.shape.width * scale;
    return {
      padding: 0,
      border: `1px solid #ccc`,
      margin: 0,
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      lineHeight: `${lineHeight}px`,
      fontSize: `${fontSize}px`,
      height: height,
      background: 'white',
      ...fontFamily
    };
  }

  @action setTargetId(id: string) {
    this.targetIcon = id;
  }

  public beforeEdit(): void {
    runInAction(() => {
      if(!this.targetText) {
        const options = this.selectOptions;
        if(options.length) {
          this.setTargetId(options[0].id);
        }
      }
    })
    super.beforeEdit();
  }

  protected getHeight(): number {
    return CELL_SIZE_2;
  }

  protected initShape(): void {
    super.initShape();
    this.textStore.setWidth(() => this.width);
    this.textStore.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y
    });
  }
}