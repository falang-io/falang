import { observer } from 'mobx-react';
import { Line } from '../../../cmp/Line';
import { CELL_SIZE } from '../../../common/constants';
import { BlockContainerComponent } from '../../../common/blocks/cmp/BlockContainer.cmp';
import { RectangleRoundedComponent } from '../../../cmp/RectangleRounded.cmp';
import { TIconRenderer } from '../../../infrastructure/IInfrastructureConfig';
import { IconStore } from '../../base/Icon.store';

export const FunctionFooterComponent: TIconRenderer<IconStore> = observer(({ icon }) => {
  return <g id={`FunctionFooterComponent-${icon.id}`}>
    <Line
      x1={icon.position.x}
      x2={icon.position.x}
      y1={icon.position.y}
      y2={icon.position.y + CELL_SIZE}
      selected={icon.isInSelected}
    />
    <BlockContainerComponent icon={icon}>
      <RectangleRoundedComponent block={icon.block} />
    </BlockContainerComponent>
  </g>;
});
