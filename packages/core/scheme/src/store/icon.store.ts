import type { NodeStore } from './node.store.js';
import { FlowNodeStore } from './flow-node.store.js';
import { addFlag, IconFlags } from '../types/icon-flags.js';
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
    this.flags = nodeConfig.mods?.length ? addFlag(flags, IconFlags.WithMods) : flags;
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

  /** Minimum block height — the block config's by default; an icon whose look depends on its state may override it. */
  get blockMinHeight(): number | undefined {
    return this.config.block.minHeight;
  }

  /** Whether the user may resize the block's width — the block config's `resizable` by default; overridable like `blockMinHeight`. */
  get blockResizable(): boolean {
    return this.config.block.resizable !== false;
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

  /** Left half of the block plus the shape padding — without any mods. */
  @computed get blockOwnLeft(): number {
    return Math.round(this.blockWidth / 2) + this.config.shape.paddings.left;
  }

  @computed get blockOwnRight(): number {
    return Math.round(this.blockWidth / 2) + this.config.shape.paddings.left;
  }

  /** Room taken on the left by mods placed `left` (a `badge` mod takes none). */
  @computed get modsLeft(): number {
    return this.getModsExtent('left');
  }

  @computed get modsRight(): number {
    return this.getModsExtent('right');
  }

  @computed get blockFullLeft(): number {
    return this.blockOwnLeft + this.modsLeft;
  }

  @computed get blockFullRight(): number {
    return this.blockOwnRight + this.modsRight;
  }

  @computed get blockFullHeight(): number {
    const shapePaddings = this.config.shape.paddings;
    return this.blockHeight + shapePaddings.top + shapePaddings.bottom;
  }

  private getModsExtent(placement: 'left' | 'right'): number {
    let extent = 0;
    this.mods.forEach((mod) => {
      if (mod.config.mod?.placement === placement) extent += CELL_SIZE + mod.left + mod.right;
    });
    return extent;
  }

  /**
   * Places `left`/`right` mods beside the block, outward in list order, their top aligned with the
   * host's block top. Subclasses that override `resetShape` must call `super.resetShape()`.
   */
  resetShape(): void {
    let offsetLeft = 0;
    let offsetRight = 0;
    this.mods.forEach((mod) => {
      const placement = mod.config.mod?.placement;
      const y = () => this.y + this.blockPosition.y + this.config.shape.paddings.top;
      if (placement === 'left') {
        const offset = offsetLeft;
        mod.setPosition({ x: () => this.x - this.blockOwnLeft - CELL_SIZE - mod.right - offset, y });
        offsetLeft += CELL_SIZE + mod.left + mod.right;
      } else if (placement === 'right') {
        const offset = offsetRight;
        mod.setPosition({ x: () => this.x + this.blockOwnRight + CELL_SIZE + mod.left + offset, y });
        offsetRight += CELL_SIZE + mod.left + mod.right;
      }
    });
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
