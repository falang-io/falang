import type { INode, INodeMeta } from '@falang/dto';
import { makeObservable, observable } from 'mobx';

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
    this.data = node.data ?? null;
    this.meta = node.meta ?? {};
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
