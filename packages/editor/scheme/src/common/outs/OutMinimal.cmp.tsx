import { observable } from 'mobx';
import { observer } from 'mobx-react';
import { RectangleComponent } from '../../cmp/Rectangle.cmp';
import { CELL_SIZE, CELL_SIZE_2, CELL_SIZE_4 } from '../constants';
import { schemeBaseTextStyle } from '../text/styles';
import { OutStore } from './Out.store';

export const OutMinimalComponent: React.FC<{ store: OutStore }> = observer(({ store }) => {
  const t = store.scheme.frontRoot.lang.t;
  const name = t(`icon:${store.type}`);
  const levelText = store.outLevel > 1 ? `${store.outLevel}` : '';
  return <><rect
    ry='4px'
    x={store.position.x - CELL_SIZE_2}
    y={store.position.y}
    width={CELL_SIZE_4}
    height={CELL_SIZE}
  />
    <text
      className='inblock-text'
      style={schemeBaseTextStyle}
      x={store.position.x - CELL_SIZE_2 + 4}
      y={store.position.y + CELL_SIZE - 4}
    >
      {name}{levelText}
    </text>

  </>;
});
