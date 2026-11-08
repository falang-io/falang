import { CELL_SIZE_4, SimpleIconStore, type IIconStoreParams } from '@falang/scheme';

/** The function's closing block: always `CELL_SIZE_4` wide, whatever an older document stored in `meta.width`. */
export class FunctionFooterIconStore extends SimpleIconStore {
  constructor(params: IIconStoreParams) {
    super(params);
    this.setBlockWidth(CELL_SIZE_4);
  }

  override get blockResizable(): boolean {
    return false;
  }
}
