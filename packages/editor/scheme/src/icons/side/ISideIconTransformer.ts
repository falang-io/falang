import type { IContextMenuItem } from '@falang/frontend-core';
import type { IconStore } from '../base/Icon.store';
import type { IconTransformer } from '../base/Icon.transformer';

export interface ISideIconTransformer extends IconTransformer {  
  getContextMenuForMain(icon: IconStore): IContextMenuItem[];
}