
import { observer } from 'mobx-react';
import React from 'react'
import { HorisontalLine } from '../../cmp/HorisontalLine';
import { Line } from '../../cmp/Line';
import { LongLine } from '../../cmp/LongLine';
import { TripleLineWithArrow } from '../../cmp/TripleLineWithArrow';
import { VerticalLine } from '../../cmp/VerticalLine';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { CycleIconStore } from './Cycle.icon.store';

export const CycleIconComponent: TIconRenderer<CycleIconStore> = observer(({ icon }) => {
  return <>
    {(!icon.hideBackArrow) ? <TripleLineWithArrow
      xStart={icon.arrowBottomX}
      xVerticalLine={icon.position.x - icon.shape.leftSize}
      xFinish={icon.arrowTopX}
      yStart={icon.arrowBottomY}
      selected={icon.isInSelected}
      yFinish={icon.arrowTopY}
    /> : null}
    {icon.hasBreak ? <Line
      x1={icon.vericalBrakeLineX}
      y1={icon.verticalBrakeLineY}
      x2={icon.vericalBrakeLineX}
      y2={icon.breakArrowY}
      selected={icon.isInSelected || icon.scheme.selection.isHighlighted('break', icon.id)}
    /> : null}
    {icon.hasBreak ? <LongLine
      x1={icon.vericalBrakeLineX}
      y1={icon.breakArrowY}
      x2={icon.breakArrowX}
      y2={icon.breakArrowY}
      selected={icon.isInSelected || icon.scheme.selection.isHighlighted('break', icon.id)}
      arrowAtEnd={true}
    /> : null}
    {(icon.verticalContinueLineX && icon.myContinueOutline) ? <>
      <VerticalLine
        isSelected={icon.isInSelected || icon.scheme.selection.isHighlighted('continue', icon.id)} 
        line={{
          x: icon.verticalContinueLineX,
          y1: icon.myContinueOutline.y,
          y2: icon.continueLineLastY,
          targetId: icon.id,
          type: 'continue',
        }
      } />
    </> : null}
    {(icon.verticalContinueLineX) ? <>
      <LongLine
        selected={icon.isInSelected || icon.scheme.selection.isHighlighted('continue', icon.id)}
        x1={icon.verticalContinueLineX}
        x2={icon.continueLineLastX}
        y1={icon.continueLineLastY}
        y2={icon.continueLineLastY}
        arrowAtEnd={true}
      />
      </> : null}
    <SkewerComponent skewer={icon.skewer} />
  </>
});
