import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { RectangleComponent } from '../../cmp/Rectangle.cmp';
import { OutputIconStore } from './Output.icon.store';

export const OutputIconComponent: TIconRenderer<OutputIconStore> = ({
  icon,
}) => (
  <BlockContainerComponent icon={icon}>
    <polyline points={icon.polylinePoints} style={icon.blockBodyStyles} />
    <RectangleComponent block={icon.block} />
  </BlockContainerComponent>
);
