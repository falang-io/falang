import { observer } from 'mobx-react-lite';
import type { IIconView } from '../types/icon-config.js';
import { BaseIconComponent } from '../cmp/base.icon.cmp.js';
import type { IconWithThreadsStore } from './icon-with-threads.store.js';
import { ThreadsComponent } from './threads.cmp.js';

export const IconWithThreadsComponent: IIconView<IconWithThreadsStore> = observer(({ icon }) => (
  <>
    <BaseIconComponent icon={icon} />
    <ThreadsComponent threads={icon.threads} />
  </>
));
