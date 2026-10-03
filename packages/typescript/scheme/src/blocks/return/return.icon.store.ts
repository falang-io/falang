import { BLOCK_DEFAULT_WIDTH, CELL_SIZE_4, OutIconStore, type IIconStoreParams } from '@falang/scheme';
import { computed, makeObservable, reaction } from 'mobx';
import { isInValueReturningFunction } from './return-value.js';

/**
 * A `return` out icon that looks like `break`/`continue` in a function without a return value and
 * like a titled value block otherwise. The block width follows the function's kind unless the user
 * resized the block (`meta.width`).
 */
export class ReturnIconStore extends OutIconStore {
  private readonly disposeWidthReaction: () => void;

  constructor(params: IIconStoreParams) {
    super(params);
    makeObservable(this);
    this.disposeWidthReaction = reaction(
      () => this.returnsValue,
      (returnsValue) => {
        if (typeof this.dataNode.meta?.width === 'number') return;
        this.setBlockWidth(returnsValue ? BLOCK_DEFAULT_WIDTH : CELL_SIZE_4);
      },
      { fireImmediately: true },
    );
  }

  @computed get returnsValue(): boolean {
    return isInValueReturningFunction(this.dataNode);
  }

  override dispose(): void {
    this.disposeWidthReaction();
    super.dispose();
  }
}
