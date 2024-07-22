import { ILinkInfo } from '@falang/frontend-core';
import { action, computed, makeObservable, observable } from 'mobx';
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT } from '@falang/editor-scheme';
import { TextBlockStore, TTextBlockStoreParams } from '../text/TextBlockStore';
import { fontFamily } from '@falang/editor-scheme';

export type TLinkBlockStoreParams = {
  schemeId: string
} & TTextBlockStoreParams;

export class LinkBlockStore extends TextBlockStore {
  readonly linkOptions = observable<ILinkInfo>([]);
  @observable schemeId: string;
  constructor(params: TLinkBlockStoreParams) {
    super(params);
    this.schemeId = params.schemeId;
    makeObservable(this);
  }

  @computed get options() {
    return this.linkOptions.filter((o) => o.path !== this.scheme.documentPath);
  }

  private async reloadOptions() {
    try {
      const options = await this.scheme.frontRoot.links.getLinksOptions(this.scheme.projectPath);
      this.linkOptions.replace(options);
    } catch (err) {
      this.scheme.frontRoot.toaster.show({
        message: err instanceof Error ? err.message : JSON.stringify(err),
        intent: 'danger',
      })
    }
  }

  saveAndClose(): void {
    this.scheme.editing.stopEdit();
  }

  @action setLink(id: string) {    
    const option = this.linkOptions.find((o) => o.id === id);
    this.setText(option?.text ?? '');
    this.color = option?.color ?? '#ffffff';;
    this.schemeId = id;
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
      ...fontFamily,
    };
  }

  public beforeEdit(): void {
    super.beforeEdit();
    this.reloadOptions();
  }

}