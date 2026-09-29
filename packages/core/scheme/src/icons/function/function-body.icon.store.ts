import { computed, makeObservable } from 'mobx';
import type { IIconOutLine } from '../../types/icon-outline.js';
import type { IIconWithSkewerStoreParams } from '../../skewer/icon-with-skewer.store.js';
import { IconWithSkewerCommonStore } from '../../skewer/icon-with-skewer-common.store.js';
import { addFlag, IconFlags } from '../../types/icon-flags.js';

export class FunctionBodyIconStore extends IconWithSkewerCommonStore {
  constructor(params: IIconWithSkewerStoreParams) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.FunctionBody),
    });
    makeObservable(this);
  }
  /*
    protected getOutsIds(): string[] {
      const outsIds = this.outsIds;
      return outsIds.filter((outId) => {
        const icon = this.registry.get(outId) as OutStore;
        if (icon.type === 'return') return false;
        return true;
      });
    }
  */
  @computed get hasReturns(): boolean {
    return this.myIconOutlines.length > 0;
  }

  @computed.struct get myIconOutlines(): IIconOutLine[] {
    return this.skewer.outLines.filter((outline) => outline.type === 'return');
  }

  @computed get lastReturnX(): number {
    const outlines = [...this.myIconOutlines];
    if (outlines.length === 0) return 0;
    outlines.sort((a, b) => a.x - b.x);
    return outlines.at(-1)?.x ?? 0;
  }
}
