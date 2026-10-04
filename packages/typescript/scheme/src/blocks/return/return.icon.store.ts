import {
  BLOCK_DEFAULT_WIDTH,
  CELL_SIZE,
  CELL_SIZE_2,
  CELL_SIZE_4,
  OutIconStore,
  type IIconStoreParams,
} from '@falang/scheme';
import { computed, makeObservable, reaction } from 'mobx';
import { isInValueReturningFunction } from './return-value.js';

/**
 * A `return` out icon that looks like `break`/`continue` in a function without a return value — one cell
 * high, a fixed `CELL_SIZE_4` wide, not resizable — and like a titled value block otherwise, whose width
 * is the user's (`meta.width`) or the default.
 */
export class ReturnIconStore extends OutIconStore {
  private readonly disposeWidthReaction: () => void;

  constructor(params: IIconStoreParams) {
    super(params);
    makeObservable(this);
    this.disposeWidthReaction = reaction(
      () => this.returnsValue,
      (returnsValue) => {
        const width = this.dataNode.meta?.width;
        if (returnsValue) this.setBlockWidth(typeof width === 'number' ? width : BLOCK_DEFAULT_WIDTH);
        else this.setBlockWidth(CELL_SIZE_4);
      },
      { fireImmediately: true },
    );
  }

  @computed get returnsValue(): boolean {
    return isInValueReturningFunction(this.dataNode);
  }

  override get blockMinHeight(): number {
    return this.returnsValue ? CELL_SIZE_2 : CELL_SIZE;
  }

  override get blockResizable(): boolean {
    return this.returnsValue;
  }

  override dispose(): void {
    this.disposeWidthReaction();
    super.dispose();
  }
}
