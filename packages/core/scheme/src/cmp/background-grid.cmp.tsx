import { observer } from 'mobx-react-lite';
import type { Scheme } from '../scheme/scheme.js';
import styled from '@emotion/styled';
import { CELL_SIZE } from '../constants.js';

const BackgroundGridComponentDiv = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
`;

export const BackgroundGridComponent: React.FC<{ scheme: Scheme }> = observer(({ scheme }) => {
  const viewPosition = scheme.viewPosition;
  const { scale, x, y } = viewPosition;
  const patternWidth = CELL_SIZE * scale;
  const patternHeight = patternWidth;
  const theme = scheme.theme.value;
  if (!theme.gridColor) return null;
  return (
    <BackgroundGridComponentDiv>
      <svg width="100%" height="100%">
        <defs>
          <pattern
            id="star"
            viewBox={`0,0,${CELL_SIZE},${CELL_SIZE}`}
            x={x}
            y={y}
            width={patternWidth}
            height={patternHeight}
            patternUnits="userSpaceOnUse"
          >
            <line x1={0} y1={0} x2={0} y2={CELL_SIZE} stroke={theme.gridColor} />
            <line x1={0} y1={0} x2={CELL_SIZE} y2={0} stroke={theme.gridColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" x={0} y={0} fill="url(#star)" />
      </svg>
    </BackgroundGridComponentDiv>
  );
});
