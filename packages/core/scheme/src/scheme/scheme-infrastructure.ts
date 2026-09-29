import { NodesStack } from '@falang/dto';
import type { TIconsConfig, TIconsFinalConfig } from '../types/icons-config.js';
import type { IconsGroup } from './icons-group.js';

const getFinalConfig = (config: TIconsConfig): TIconsFinalConfig => {
  const returnValue: TIconsFinalConfig = {};
  // oxlint-disable-next-line guard-for-in
  for (const key in config) {
    const shape = config[key].shape;
    returnValue[key] = {
      ...config[key],
      shape: {
        ...shape,
        paddings: {
          left: shape.paddings?.left ?? 0,
          top: shape.paddings?.top ?? 0,
          bottom: shape.paddings?.bottom ?? 0,
          right: shape.paddings?.right ?? 0,
        },
      },
    };
  }
  return returnValue;
};

export class SchemeInfrastructure {
  readonly structure: NodesStack;
  readonly iconsConfig: TIconsFinalConfig;
  readonly iconsGroups: IconsGroup[];

  // oxlint-disable-next-line typescript/no-explicit-any
  constructor(groups: IconsGroup<any>[]) {
    this.structure = new NodesStack(groups.map((g) => g.nodes));
    let iconsConfig: TIconsFinalConfig = {};
    groups.forEach((g) => {
      iconsConfig = {
        ...iconsConfig,
        ...getFinalConfig(g.icons),
      };
    });
    this.iconsConfig = iconsConfig;
    this.iconsGroups = groups;
  }
}
