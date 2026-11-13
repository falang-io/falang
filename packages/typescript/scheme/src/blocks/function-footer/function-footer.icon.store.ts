import { CELL_SIZE_4, SimpleIconStore } from '@falang/scheme';

/** The function's closing block: always `CELL_SIZE_4` wide, whatever an older document stored in `meta.width`. */
export class FunctionFooterIconStore extends SimpleIconStore {
  protected override get storedBlockWidth(): number {
    return CELL_SIZE_4;
  }

  override get blockResizable(): boolean {
    return false;
  }
}
