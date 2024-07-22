import { BlockStore, IBlockStoreParams } from '../../blocks/store/BlocksStore';
import { CELL_SIZE, CELL_SIZE_2, CELL_SIZE_4 } from '../../constants';
import { IBlockBadge } from '../../IBlockBadge';
import { TOutType } from '../Out.store';

export interface IOutMinimalBlockStoreParams extends IBlockStoreParams {
  type: TOutType
  outLevel: number
}

export class OutMinimalBlockStore extends BlockStore {
  type: TOutType
  outLevel: number

  constructor(params: IOutMinimalBlockStoreParams) {
    super({
      ...params,
      color: params.type === 'throw' ? '#f8bbd0' : undefined,
    });
    this.type = params.type;
    this.outLevel = params.outLevel;
  }

  protected initShape(): void {
    super.initShape();
    this.shape.setSize({
      height: CELL_SIZE,
      leftSize: CELL_SIZE_2,
      rightSize: CELL_SIZE_2,
    });
  }

  getBlockBadges(): IBlockBadge[] {
    const t = this.scheme.frontRoot.lang.t;
    const name = t(`icon:${this.type}`);
    const levelText = this.outLevel > 1 ? ` ${this.outLevel}` : '';
    return [{
      dx: 0,
      dy: 0,
      text: `${name}${levelText}`,
    }];
  }
}