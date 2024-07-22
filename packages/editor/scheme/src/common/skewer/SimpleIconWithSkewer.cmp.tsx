import { BlockContainerComponent } from '../blocks/cmp/BlockContainer.cmp';
import { RectangleComponent } from '../../cmp/Rectangle.cmp';
import { RectangleRoundedComponent } from '../../cmp/RectangleRounded.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { SimpleIconWithSkewerStore } from './SimpleIconWithSkewer.store';
import { SkewerComponent } from './Skewer.cmp';
import { observer } from 'mobx-react';

export const SimpleIconWithSkewerComponent: TIconRenderer<SimpleIconWithSkewerStore> = observer(({ icon }) => {
  return <g id={`simple-icon-with-skewer-${icon.id}`}>
    {icon.block.shape.height === 0
      ? null
      : (
        <BlockContainerComponent icon={icon}>
          <RectangleComponent block={icon.block} />
        </BlockContainerComponent>
      )}
    <SkewerComponent skewer={icon.skewer} />
  </g>
});
