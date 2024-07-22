import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { HorisontalLine } from '../../cmp/HorisontalLine';
import { Line } from '../../cmp/Line';
import { VerticalLine } from '../../cmp/VerticalLine';
import { CELL_SIZE } from '../../common/constants';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { RectangleRoundedComponent } from '../../cmp/RectangleRounded.cmp';
import { FunctionFooterComponent } from './cmp/FunctionFooter.cmp';
import { FunctionHeaderComponent } from './cmp/FunctionHeader.cmp';

import type { FunctionIconStore } from './Function.icon.store';

export const FunctionIconComponent: TIconRenderer<FunctionIconStore> = observer(({ icon }) => {
  return <g id={`Function-${icon.id}`}>
    {icon.hasReturns ? <HorisontalLine
      isSelected={icon.isInSelected || icon.scheme.selection.isHighlighted('return', icon.id)}
      line={{
        nextShoe: false,
        shoe: false,
        targetId: icon.id,
        type: 'return',
        x1: icon.lastReturnX,
        x2: icon.position.x + icon.footer.shape.rightSize,
        y: icon.returnLineBottomY
      }}
      arrowAtEnd={true}
    /> : null}
    {icon.returnConnectLines.map((hw, index) => <VerticalLine
      key={index}
      line={hw}
      isSelected={icon.isInSelected || icon.scheme.selection.isHighlighted(hw.type, hw.targetId)}
    />)}
    <FunctionHeaderComponent icon={icon.header} />
    <FunctionFooterComponent icon={icon.footer} />
    <BlockContainerComponent icon={icon}>
      <RectangleRoundedComponent block={icon.block} fillWidth={icon.fillBlockWidth} />
    </BlockContainerComponent>
    <SkewerComponent skewer={icon.skewer} />
  </g>;
});
