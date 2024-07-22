import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { SwitchOptionStore } from './SwitchOption.store';

export const SwitchOptionComponent: TIconRenderer<SwitchOptionStore> = observer(({ icon }) => {
  return <>
    <BlockContainerComponent icon={icon}>
      <polyline
        points={icon.trianglePolylinePoints}
        style={icon.blockBodyStyles}
      />
      <rect
        style={icon.blockBodyStyles}
        x={icon.position.x - icon.block.shape.leftSize}
        y={icon.position.y}
        width={icon.block.width}
        height={icon.block.shape.height}
      />
    </BlockContainerComponent>
    <SkewerComponent skewer={icon.skewer} />
  </>;
});