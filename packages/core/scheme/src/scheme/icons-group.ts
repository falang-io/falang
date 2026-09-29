import type { INodeConfig, NodesGroup } from '@falang/dto';
import type { TIconsConfig } from '../types/icons-config.js';

export class IconsGroup<TConfig extends readonly INodeConfig[] = readonly INodeConfig[]> {
  nodes: NodesGroup<TConfig>;
  icons: TIconsConfig<TConfig>;

  constructor(nodes: NodesGroup<TConfig>, icons: TIconsConfig<TConfig>) {
    this.nodes = nodes;
    this.icons = icons;
  }
}
