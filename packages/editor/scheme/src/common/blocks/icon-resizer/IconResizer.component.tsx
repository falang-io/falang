import { observer } from 'mobx-react';
import { BlockStore } from '../store/BlocksStore';
import { IconResizerStore } from './IconResizerState';

export interface IIconResizerComponentProps {
  state: IconResizerStore
  block: BlockStore
}

export const IconResizerComponent: React.FC<IIconResizerComponentProps> = observer(({ state, block }) => {
  return <circle
    cx={block.position.x + block.width + block.resizeBarGap}
    cy={block.position.y + block.shape.halfHeight}
    r={4}
    fill='white'
    stroke='black'
    strokeWidth={1}
    style={{
      cursor: 'ew-resize',
    }}
    onMouseDown={(e) => {
      state.onMouseDown(e, block);
    }}
    onClick={(e) => {
      //console.log('ononkno');
    }}
  />
});