import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { RectangleComponent } from '../../cmp/Rectangle.cmp';
import { InputIconStore } from './Input.icon.store';

export const InputIconComponent: TIconRenderer<InputIconStore> = ({
  icon,
}) => (
  <BlockContainerComponent icon={icon}>
    <polyline points={icon.polylinePoints} style={icon.blockBodyStyles} />
    <RectangleComponent block={icon.block} />
  </BlockContainerComponent>
);
