import { TextBlockStore, TTextBlockStoreParams } from '@falang/infrastructure-text';

export class LogicObjectBlockStore extends TextBlockStore {

  constructor(params: TTextBlockStoreParams) {
    super({
      ...params,
      editable: false,
    });
  }

  protected getText(): string {
    return this.scheme.name;
  }
}