import type { NodeStore } from './node.store.js';
import { FlowNodeStore } from './flow-node.store.js';
import { IconFlags } from '../types/icon-flags.js';
import { action, computed, makeObservable, observable } from 'mobx';
import type { IIconNodeFinalConfig } from '../types/icon-config.js';
import { BLOCK_DEFAULT_WIDTH, CELL_SIZE } from '../constants.js';
import { DEFAULT_NUMBER_COMPUTED, type TNumberComputed } from '../types/computed-value.js';
import type { INodeConfig, INodeMeta } from '@falang/dto';

export interface IIconStoreParams {
  dataNode: NodeStore;
  nodeConfig: INodeConfig;
  flags?: IconFlags;
  config: IIconNodeFinalConfig;
}

export abstract class IconStore extends FlowNodeStore {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  @observable blockWidth: number;
  @observable blockHeight = 0;
  @observable parent: IconStore | null = null;
  readonly mods = observable<IconStore>([]);
  private _shapeDX: TNumberComputed = DEFAULT_NUMBER_COMPUTED;
  private _shapeDY: TNumberComputed = DEFAULT_NUMBER_COMPUTED;
  readonly flags: IconFlags;
  readonly config: IIconNodeFinalConfig;
  readonly nodeConfig: INodeConfig;
  readonly dataNode: NodeStore;

  constructor({ dataNode, flags = IconFlags.None, config, nodeConfig }: IIconStoreParams) {
    super();
    this.id = dataNode.id;
    this.name = dataNode.name;
    this.flags = flags;
    this.config = config;
    this.dataNode = dataNode;
    this.title = config.title === true ? `icon:${this.name}` : (config.title ?? null);
    const meta = dataNode.meta;
    this.blockWidth = typeof meta?.width === 'number' ? meta.width : (config.block.defaultWidth ?? BLOCK_DEFAULT_WIDTH);
    this.nodeConfig = nodeConfig;
    makeObservable(this);
  }

  @action setParent(icon: IconStore | null): void {
    this.parent = icon;
  }

  @action setBlockWidth(width: number): void {
    this.blockWidth = width;
  }

  protected setShapePosition({ dx, dy }: { dx: TNumberComputed; dy: TNumberComputed }): void {
    this._shapeDX = dx;
    this._shapeDY = dy;
  }

  @computed get blockPosition(): { x: number; y: number; width: number } {
    return {
      x: -Math.round(this.blockWidth / 2) + this._shapeDX(),
      y: this._shapeDY(),
      width: this.blockWidth,
    };
  }

  @computed get blockFullLeft(): number {
    let left = Math.round(this.blockWidth / 2) + this.config.shape.paddings.left;
    this.mods?.forEach((mod) => {
      left += CELL_SIZE + mod.left + mod.right;
    });
    return left;
  }

  @computed get blockFullRight(): number {
    return Math.round(this.blockWidth / 2) + this.config.shape.paddings.left;
  }

  @computed get blockFullHeight(): number {
    const shapePaddings = this.config.shape.paddings;
    return this.blockHeight + shapePaddings.top + shapePaddings.bottom;
  }

  resetShape(): void {
    //
  }

  dispose(): void {
    super.dispose();
    this.setParent(null);
    this._shapeDX = DEFAULT_NUMBER_COMPUTED;
    this._shapeDY = DEFAULT_NUMBER_COMPUTED;
    if (this.mods) {
      this.mods.forEach((m) => m.dispose());
      this.mods.clear();
    }
  }

  getMeta(): INodeMeta {
    return {};
  }

  get parentId(): string | null {
    return this.parent?.id ?? null;
  }
}
