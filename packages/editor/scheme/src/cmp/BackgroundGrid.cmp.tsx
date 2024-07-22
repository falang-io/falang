import { observer } from 'mobx-react';
import { CELL_SIZE } from '../common/constants';
import { SchemeStore } from '../store/Scheme.store';

interface BackgroundGridComponentProps {
  scheme: SchemeStore
}

export const BackgroundGridComponent: React.FC<BackgroundGridComponentProps> = observer(({ scheme }) => {
  const { scale, x, y } = scheme.viewPosition;
  const patternWidth = 16 * scale;
  const patternHeight = patternWidth;
  return <>
    <defs>
      <pattern id="star" viewBox="0,0,16,16" x={x} y={y} width={patternWidth} height={patternHeight} patternUnits="userSpaceOnUse">
        <line x1={0} y1={0} x2={0} y2={16} stroke="#ccc" />
        <line x1={0} y1={0} x2={16} y2={0} stroke="#ccc" />
      </pattern>
    </defs>
    <rect width='100%' height='100%' x={0} y={0} fill='url(#star)' />
  </>;
});
