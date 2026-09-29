import { computed, makeObservable, observable } from 'mobx';
import type { IIconStoreParams } from '../../store/icon.store.js';
import { IconStore } from '../../store/icon.store.js';
import type { INodeMeta, IOutType } from '@falang/dto';
import { getOutIconTargetId } from './get-out-target-id.js';
import { addFlag, IconFlags } from '../../types/icon-flags.js';
import { CELL_SIZE } from '../../constants.js';
import type { IIconWithOwnLines } from '../../types/icon-with-lines.js';
import type { ILineParams } from '../../cmp/line.js';

export class OutIconStore extends IconStore implements IIconWithOwnLines {
  readonly type: IOutType;
  @observable level = 1;

  constructor(params: IIconStoreParams) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.Out, IconFlags.WithOwnLines),
    });
    const nodeOutType = params.nodeConfig.outType;
    if (!nodeOutType) throw new Error(`Node out type should be set in node config for "${params.nodeConfig.name}"`);
    this.type = nodeOutType;
    const outLevel = params.dataNode.meta.outLevel;
    if (typeof outLevel === 'number') this.level = outLevel;
    makeObservable(this);
  }

  getMeta(): INodeMeta {
    // `outLevel` is only included when it's genuinely non-default (> 1). `level` defaults to 1 for
    // every out node, but an *absent* `outLevel` and an explicit `outLevel: 1` are not the same thing
    // to the compilers (see `packages/workflow/compiler/src/out-nodes.test.ts`): no `outLevel` means a
    // plain `break;`/`continue;`, while an explicit one (even `1`) means a labeled
    // `break L1;`/`continue L1;`. Since `getMeta()` now feeds `getNodeStoreDto`'s serialization for
    // every node (not just ones a caller happened to set meta on already), always emitting
    // `outLevel: 1` here would silently turn every plain break/continue into a labeled one on save.
    // A value explicitly present on `node.meta` still wins regardless (see `getNodeStoreDto`'s
    // spread order), this only controls the icon's own *computed* default.
    return {
      ...super.getMeta(),
      ...(this.level > 1 ? { outLevel: this.level } : {}),
    };
  }

  @computed get left(): number {
    return this.blockFullLeft;
  }
  @computed get right(): number {
    return this.blockFullRight;
  }
  @computed get height(): number {
    if (this.type === 'throw') return 0;
    return this.blockFullHeight > 0 ? this.blockFullHeight + CELL_SIZE : 0;
  }

  @computed get targetId(): string | null {
    return getOutIconTargetId(this);
  }

  @computed get ownLines(): ILineParams[] {
    if (this.type === 'throw') return [];
    const fullHeight = this.blockFullHeight;
    if (fullHeight === 0) return [];
    return [
      {
        x1: 0,
        x2: 0,
        y1: fullHeight,
        y2: fullHeight + CELL_SIZE,
      },
    ];
  }
}
