import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import type { IIconConfig } from '../../types/icon-config.js';
import { OutIconStore } from './out.icon.store.js';

export const outIconConfig = {
  factory: (params) => new OutIconStore(params),
  view: BaseIconComponent,
} as const satisfies IIconConfig<OutIconStore>;
