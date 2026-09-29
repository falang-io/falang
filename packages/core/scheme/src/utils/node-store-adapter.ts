import type { INode, INodeMeta } from '@falang/dto';
import type { NodeStore } from '../store/node.store.js';

/**
 * Lazily presents a NodeStore as an INode, so store instances can be passed
 * to any INode-typed API (e.g. NodesGroup.is/isIn/hasName) without cloning
 * the tree upfront like getNodeStoreDto does. Each access re-reads the
 * underlying store and wraps children on demand, so identity is not stable
 * across repeated property reads.
 */
export class NodeStoreAdapter<TName extends string = string, TData = unknown> implements INode<TName, TData> {
  private readonly store: NodeStore<TName, TData>;

  constructor(store: NodeStore<TName, TData>) {
    this.store = store;
  }

  get id(): string {
    return this.store.id;
  }

  get name(): TName {
    return this.store.name;
  }

  get meta(): INodeMeta | undefined {
    if (Object.keys(this.store.meta).length === 0) return;
    return this.store.meta;
  }

  get data(): TData | undefined {
    if (this.store.data === null) return;
    return this.store.data;
  }

  get children(): readonly INode[] | undefined {
    if (this.store.children.length === 0) return;
    return this.store.children.map((child) => new NodeStoreAdapter(child));
  }

  get mods(): readonly INode[] | undefined {
    if (this.store.mods.length === 0) return;
    return this.store.mods.map((mod) => new NodeStoreAdapter(mod));
  }

  get out(): INode | undefined {
    if (!this.store.out) return;
    return new NodeStoreAdapter(this.store.out);
  }
}
