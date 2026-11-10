import type { INode, INodeMeta } from '@falang/dto';
import { makeObservable, observable } from 'mobx';
import { toPlainData } from '../utils/to-plain-data.js';

export class NodeStore<TName extends string = string, TData = unknown> {
  readonly id: string;
  readonly name: TName;
  @observable.ref data: TData | null;
  readonly children = observable<NodeStore>([]);
  @observable.ref meta: INodeMeta;
  readonly mods = observable<NodeStore>([]);
  @observable out: NodeStore | null = null;
  @observable parent: NodeStore | null = null;

  constructor(node: INode<TName, TData>) {
    this.id = node.id;
    this.name = node.name;
    // Plain copies: a host may pass a tree straight out of its deep-observable document store, and a proxy kept here
    // would leak into every DTO (`structuredClone` in copy/paste, IPC) — see `toPlainData`.
    this.data = toPlainData(node.data ?? null);
    this.meta = toPlainData(node.meta ?? {});
    makeObservable(this);
  }

  dispose() {
    this.children.forEach((child) => child.dispose());
    this.mods.forEach((mod) => mod.dispose());
    this.children.clear();
    this.mods.clear();
    this.out?.dispose();
    this.out = null;
    this.parent = null;
  }
}
