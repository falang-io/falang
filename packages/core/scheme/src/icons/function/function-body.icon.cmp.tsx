import { observer } from 'mobx-react-lite';
import type { IIconView } from '../../types/icon-config.js';
import type { FunctionBodyIconStore } from './function-body.icon.store.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import { SkewerComponent } from '../../skewer/skewer.cmp.js';

export const FunctionBodyIconComponent: IIconView<FunctionBodyIconStore> = observer(({ icon }) => (
  <>
    <BaseIconComponent icon={icon} />
    <SkewerComponent skewer={icon.skewer} />
  </>
));
