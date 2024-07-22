import React from 'react';
import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { HorisontalLine } from '../../cmp/HorisontalLine';
import { Line } from '../../cmp/Line';
import { VerticalLine } from '../../cmp/VerticalLine';
import { CELL_SIZE } from '../../common/constants';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { ThreadsComponent } from '../../common/threads/Threads.cmp';
import { ThreadsIconStore } from '../../common/threads/ThreadsIconStore';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { LifegramFunctionIconStore } from './LifeGramFunction.icon.store';

export const LifeGramFunctionIconComponent: TIconRenderer<LifegramFunctionIconStore> = observer(({icon}) => {
  return <>
    <Line
        x1={icon.position.x}
        y1={icon.position.y}
        x2={icon.position.x}
        y2={icon.position.y + CELL_SIZE}
        selected={icon.isInSelected}
    />
    {/*icon.returnConnectLines.map((hw, index) => <VerticalLine
      key={index}
      line={hw}
      isSelected={icon.isInSelected || icon.scheme.selection.isHighlighted(hw.type, hw.targetId)}
/>)*/}
    {icon.returnLines.map((item, index) => <React.Fragment key={index}>
      {item.y2 > item.y1 ? <Line
        x1={item.x1}
        x2={item.x1}
        y1={item.y1}
        y2={item.y2}        
        selected={icon.isInSelected}
      /> : null}
      {item.y3 > item.y2 ? <Line
        x1={item.x2}
        x2={item.x2}
        y1={item.y2}
        y2={item.y3}
        selected={icon.isInSelected}
      /> : null}
      {item.x1 !== item.x2 ? <Line
        x1={item.x1}
        x2={item.x2}
        y1={item.y2}
        y2={item.y2}
        selected={icon.isInSelected}
      /> : null}
    
    </React.Fragment>)}
    {/*icon.allVerticalLines.map((vl, index) => <VerticalLine 
      line={vl}
      key={index}
      isSelected={icon.isInSelected}
    />)}
    {icon.connectHorisontalLines.map((line, index) => <HorisontalLine
      line={line}
      key={index}
      isSelected={icon.isInSelected}
    />)*/}
    <BlockContainerComponent
      icon={icon}
    >
        <g className='box-body'>
            <polyline
                points={icon.trianglePolylinePoints}
                style={icon.blockBodyStyles}
            />
            <rect
                className='box-body'
                x={icon.position.x - icon.block.shape.leftSize}
                y={icon.position.y + CELL_SIZE}
                width={icon.block.width}
                height={icon.block.shape.height}
                style={icon.blockBodyStyles}
            /> 
        </g>
    </BlockContainerComponent>
    <SkewerComponent skewer={icon.skewer} />
    <ThreadsComponent icon={icon.footer as ThreadsIconStore} />
  </>;
});