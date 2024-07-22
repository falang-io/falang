import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { CenteredText } from '@falang/infrastructure-text';
import { schemeBaseTextStyle } from '@falang/editor-scheme';
import { FunctionHeaderBlockStore } from './FunctionHeader.block.store';

export const FunctionHeaderLinesComponent: React.FC<{ block: FunctionHeaderBlockStore }> = observer(({ block }) => {
  const by = block.position.y;
  const x = block.position.x;
  const w = block.shape.width;
  const ph = block.parametersHeight;
  const nw = block.namesWidth;
  const t = block.scheme.frontRoot.lang.t;
  const maxParameterWidth = block.maxParameterWidth;
  return <>
    <CenteredText 
      x={x}      
      y={by}
      width={block.shape.width}
      text={block.scheme.name}
      height={CELL_SIZE * 2}
      textWidth={block.functionHeaderTextWidth}
    />  
    <text
      className='inblock-text'
      style={schemeBaseTextStyle}
      x={x + 4}
      y={by + CELL_SIZE * 3 - 4}
    >
      {t('logic:func_parameters')}
    </text>
    <text
      className='inblock-text'
      style={schemeBaseTextStyle}
      x={x + 4}
      y={by + CELL_SIZE * 3 - 4}
    >
      {t('logic:func_parameters')}
    </text>
    <line
      className='inblock-line'
      x1={x}
      x2={x + w}
      y1={by + CELL_SIZE * 2}
      y2={by + CELL_SIZE * 2}
    />
    {block.parameters.map((p) => {
      return <line
        className='inblock-line'
        x1={x}
        x2={x + nw}
        y1={p.nameStore.position.y}
        y2={p.nameStore.position.y}
      />;
    })}
    <line
      className='inblock-line'
      x1={x}
      x2={x + w}
      y1={by + CELL_SIZE * 3 + ph}
      y2={by + CELL_SIZE * 3 + ph}
    />
    {block.iNeedBottomLine ? <line
      className='inblock-line'
      x1={x + block.maxParameterWidth}
      x2={x + nw}
      y1={by + CELL_SIZE * 4 + ph}
      y2={by + CELL_SIZE * 4 + ph}
    /> : null}    
    <line
      className='inblock-line'
      x1={x + nw}
      x2={x + nw}
      y1={by + CELL_SIZE * 3}
      y2={by + CELL_SIZE * 3 + ph}
    />
    <line
      className='inblock-line'
      x1={x + nw}
      x2={x + nw}
      y1={by + CELL_SIZE * 3 + ph}
      y2={by + CELL_SIZE * 3 + ph + block.returnStore.shape.height}
    />
    <text
      className='inblock-text'
      style={schemeBaseTextStyle}
      x={x + 4}
      y={by + CELL_SIZE * 4 + ph - 4}
    >
      {t('logic:return_type')}
    </text>
  </>;
});