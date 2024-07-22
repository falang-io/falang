import { observer } from 'mobx-react';
import React from 'react';
import { TBlockComponent } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { schemeBaseTextStyle } from '@falang/editor-scheme';
import { CallFunctionBlockStore } from './CallFunction.block.store';

export const CallFunctionBgBlockComponent: TBlockComponent<CallFunctionBlockStore> = observer(({ block }) => {
  const functionData = block.currentFunctionData;
  if (!functionData) return null;
  const x = block.position.x;
  const y = block.position.y;
  const w = block.shape.width;
  const t = block.scheme.frontRoot.lang.t;
  const returnY = y + CELL_SIZE + block.parametersHeight;
  let py = block.position.y + CELL_SIZE;
  const maxParameterWidth = block.maxParameterWidth;
  return <>
    <text
      className='inblock-text'
      style={schemeBaseTextStyle}
      x={x + 4}
      y={y + CELL_SIZE - 4}
    >
      {functionData.name}
    </text>
    {block.needLineAfterName ? <line
      className='inblock-line'
      x1={x}
      x2={x + w}
      y1={y + CELL_SIZE}
      y2={y + CELL_SIZE}
    />: null}
    
    {functionData.parameters.map((p, index) => {
      const currentY = py;
      const bh =  block.parametersExpressions[index]?.height ?? CELL_SIZE;
      py += bh;
      return <React.Fragment key={index}>
        <text
          className='inblock-text'
          style={schemeBaseTextStyle}
          x={x + 4}
          y={currentY + CELL_SIZE - 4}
        >
          {p.name}
        </text>
        {functionData.returnValue.type !== 'void' || index < functionData.parameters.length - 1 ? <line
          className='inblock-line'
          x1={x}
          x2={x + w}
          y1={py}
          y2={py}
        /> : null}        
        <line
          className='inblock-line'
          x1={x + maxParameterWidth}
          x2={x + maxParameterWidth}
          y1={currentY}
          y2={currentY + bh}
        />
      </React.Fragment>
    })}
    {functionData.returnValue.type !== 'void' ? <>
      <line
        className='inblock-line'
        x1={x + maxParameterWidth}
        x2={x + maxParameterWidth}
        y1={returnY}
        y2={returnY + CELL_SIZE}
      />
      <text
        className='inblock-text'
        style={schemeBaseTextStyle}
        x={x + 4}
        y={returnY + CELL_SIZE - 4}
      >
        {t('logic:return_to')}
      </text>
    </> : null}
  </>;
});