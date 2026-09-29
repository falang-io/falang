import { observer } from 'mobx-react-lite';
import type { IIconView } from '../types/icon-config.js';
import type { IconWithSkewerStore } from './icon-with-skewer.store.js';
import { BaseIconComponent } from '../cmp/base.icon.cmp.js';
import { SkewerComponent } from './skewer.cmp.js';

export const IconWithSkewerComponent: IIconView<IconWithSkewerStore> = observer(({ icon }) => (
  <>
    <BaseIconComponent icon={icon} />
    <SkewerComponent skewer={icon.skewer} />
  </>
));
