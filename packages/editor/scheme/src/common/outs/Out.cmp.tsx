import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../blocks/cmp/BlockContainer.cmp';
import { Line } from '../../cmp/Line';
import { CELL_SIZE } from '../constants';
import { RectangleRoundedComponent } from '../../cmp/RectangleRounded.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { OutStore } from './Out.store';
import { RectangleComponent } from '../../cmp/Rectangle.cmp';
import { OutMinimalComponent } from './OutMinimal.cmp';
import { observable } from 'mobx';

export const OutComponent: TIconRenderer<OutStore> = observer(({ icon }) => {
  if (!icon.isIconVisible) return null;
  console.log('shape height', icon.shape.height);
  return <g id={`${icon.type}-${icon.id}`}>
    {icon.type !== 'throw' ? <Line
      x1={icon.position.x}
      x2={icon.position.x}
      y1={icon.position.y + icon.shape.height - CELL_SIZE}
      y2={icon.position.y + icon.shape.height}
      selected={icon.isInSelected}
    /> : null}
    <BlockContainerComponent icon={icon} hideResize={!icon.isBlockShape}>
      {icon.isBlockShape ? <RectangleRoundedComponent block={icon.block} /> : <OutMinimalComponent store={icon} />}
    </BlockContainerComponent>
  </g>
});
