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
    this.checkModsConsistency();
    this.iconsGroups = groups;
  }

  /**
   * A kind is a mod in both layers or in neither: `INodeConfig.mods` lists (→ `structure.modKindNames`)
   * and the icon config's `mod` placement must name the same kinds (ADR 0049).
   */
  private checkModsConsistency(): void {
    const modKinds = this.structure.modKindNames;
    // oxlint-disable-next-line guard-for-in
    for (const name in this.iconsConfig) {
      if (this.iconsConfig[name].mod && !modKinds.has(name)) {
        throw new Error(`Icon config of "${name}" declares "mod", but no node config lists it in "mods"`);
      }
    }
    for (const name of modKinds) {
      if (!this.iconsConfig[name]?.mod) {
        throw new Error(`Node kind "${name}" is listed in "mods", but its icon config has no "mod" placement`);
      }
    }
  }
}
