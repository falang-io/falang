import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { RectangleComponent } from '../../cmp/Rectangle.cmp';
import { ActionIconStore } from './Action.icon.store';

export const ActionIconComponent: TIconRenderer<ActionIconStore> = ({
  icon,
}) => (
  <BlockContainerComponent icon={icon}>
    <RectangleComponent block={icon.block} />
  </BlockContainerComponent>
);
