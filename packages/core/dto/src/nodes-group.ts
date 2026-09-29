import { defaultFactory } from './default-factory.js';
import type { INode, INodeConfig, NodeName, NodesFromConfig } from './types.js';

export class NodesGroup<const TList extends readonly INodeConfig[] = readonly INodeConfig[]> {
  readonly list: TList;

  private readonly map: Map<string, TList[number]>;

  constructor(config: TList) {
    this.list = config;
    this.map = new Map(config.map((item) => [item.name, item]));
  }

  hasName(name: string): name is NodeName<TList> {
    return this.map.has(name);
  }

  isIn(node: INode): node is NodesFromConfig<TList> {
    return this.map.has(node.name);
  }

  is<TName extends NodeName<TList>>(
    node: INode,
    name: TName,
  ): node is Extract<NodesFromConfig<TList>, { name: TName }> {
    return this.map.has(name) && node.name === name;
  }

  factory<TName extends NodeName<TList>>(name: TName): Extract<NodesFromConfig<TList>, { name: TName }> {
    const config = this.getConfig(name);
    if (!config) throw new Error(`Config not found for ${name}`);
    return (config.factory ? config.factory() : defaultFactory(config)) as Extract<
      NodesFromConfig<TList>,
      { name: TName }
    >;
  }

  getConfig<TName extends NodeName<TList>>(name: TName): Extract<TList[number], { name: TName }> | undefined {
    return this.map.get(name) as Extract<TList[number], { name: TName }> | undefined;
  }
}
