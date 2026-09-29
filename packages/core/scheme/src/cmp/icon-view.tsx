import { observer } from 'mobx-react-lite';
import { checker } from '../checker.js';
import type { IconStore } from '../store/icon.store.js';

export const IconView: React.FC<{ icon: IconStore }> = observer(({ icon }) => {
  const IconComponent = icon.config.icon.view;
  return (
    <>
      <IconComponent icon={icon} />
      {checker.isWithChildren(icon) ? icon.children.map((child) => <IconView key={child.id} icon={child} />) : null}
    </>
  );
});
