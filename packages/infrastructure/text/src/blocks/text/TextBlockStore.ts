import { action, computed, makeObservable, observable } from 'mobx';
import { BlockStore, IBlockStoreParams, getTextAreaStyle } from '@falang/editor-scheme';
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { Text2Store, TText2StoreParams } from '../../store/Text2.store';

export type TTextBlockStoreParams = {
  text?: string
  fixed?: boolean
} & IBlockStoreParams & TText2StoreParams;

export class TextBlockStore extends BlockStore {
  readonly textStore: Text2Store;
  public changed = false;
  readonly fixed: boolean;
  readonly isTextBlock = true;

  constructor(params: TTextBlockStoreParams) {
    super({
      ...params,
      editable: !params.fixed,      
    });    
    this.fixed = !!params.fixed;
    makeObservable(this);

    this.textStore = new Text2Store(params);
  }

  protected getHeight(): number {
    return Math.max(CELL_SIZE * 2, TEXT_PADDING_HEIGHT * 2 + this.textStore.lines.length * LINE_HEIGHT);
  }

  get text() {
    return this.getText();
  }

  protected getText() {
    return this.textStore.text;
  }

  protected initShape(): void {
    super.initShape();
    this.textStore.setWidth(() => this.width);
    this.textStore.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y
    });
  }

  @action setText(text: string) {
    this.changed = true;
    this.textStore.setText(text);
  }

  @computed get gTransformValue(): string {
    const x = this.position.x;
    const y = this.position.y;
    return `translate(${x} ${y})`;
  }

  dispose(): void {
    super.dispose();
    this.textStore.dispose();
  }

  @computed.struct get textAreaStyle(): React.CSSProperties {
    return getTextAreaStyle({
      scheme: this.scheme,
      height: this.shape.height,
      width: this.shape.width,
      x: this.position.x,
      y: this.position.y,
    })
  }

  isHasValue(): boolean {
    return this.text.length > 0;
  }
}