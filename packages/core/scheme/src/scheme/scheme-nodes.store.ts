import { ObservableMap } from 'mobx';
import type { NodeStore } from '../store/node.store.js';

export class SchemeNodesStore {
  private readonly nodes = new ObservableMap<string, NodeStore>();

  add(node: NodeStore) {
    this.nodes.set(node.id, node);
  }

  get(id: string): NodeStore | null {
    return this.getNodeSafe(id);
  }

  delete(id: string) {
    this.nodes.delete(id);
  }

  getNode(id: string): NodeStore {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node ${id} not found`);
    return node;
  }

  getNodeSafe(id: string): NodeStore | null {
    const node = this.nodes.get(id);
    if (!node) return null;
    return node;
  }
}
