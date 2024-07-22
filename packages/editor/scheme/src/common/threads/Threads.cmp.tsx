import { observer } from 'mobx-react';
import React from 'react';
import { checker } from '../../checker';
import { GapControlComponent } from '../../cmp/GapControl.cmp';
import { HorisontalLine } from '../../cmp/HorisontalLine';
import { LongLine } from '../../cmp/LongLine';
import { IconComponent } from '../../icons/base/Icon.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { CELL_SIZE } from '../constants';
import { SkewerStore } from '../skewer/Skewer.store';
import { getComputedValue } from '../store/getComputedValue';
import { ThreadsIconStore } from './ThreadsIconStore';
import { ThreadsStore } from './ThreadsStore';

export const ThreadsComponent: TIconRenderer<ThreadsIconStore<any>> = observer(({ icon }) => {  
  return <g id={`Threads-${icon.id}`}>
     {icon.threads.verticalLines.map((l, index) =>
        <LongLine
          key={index}
          selected={/*icon.threads.isInSelected || */icon.threads.scheme.selection.isHighlighted(l.type, l.targetId)}
          x1={l.x}
          x2={l.x}
          y1={l.y1}
          y2={l.y2}
        />
    )}
  {icon.threads.horizontalLines.map((l, index) =>
    <HorisontalLine line={l} isSelected={/*icon.threads.isInSelected || */icon.threads.scheme.selection.isHighlighted(l.type, l.targetId)} key={index} />
  )}
  {icon.scheme.gapModify.showGapControls && icon.threads.showGapControls ? icon.threads.gapControlsXPositions.map((xPosition, index) => 
    <GapControlComponent
      key={index}
      scheme={icon.scheme}
      index={index}
      threadsId={icon.id}
      width={xPosition.width}
      x={xPosition.x}
      y={getComputedValue(icon.threads.gapControlsY, 0)}
    />
  ) : null}
  {icon.threads.icons.map((child) => (
    <IconComponent key={child.id} icon={child} />
  ))}
  </g>;
});
