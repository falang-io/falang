import type { IIconConfig } from '../../types/icon-config.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import { SideIconStore } from './side.icon.js';

export const sideIconConfig = {
  factory: (params) => new SideIconStore(params),
  view: BaseIconComponent,
} as const satisfies IIconConfig;
