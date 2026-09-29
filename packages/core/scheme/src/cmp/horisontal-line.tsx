import type React from 'react';
import { observer } from 'mobx-react-lite';
import type { IHorisontalLine } from '../types/horizontal-line.js';
import { useService } from '../hooks/use-service.js';
import { TOKEN_SCHEME } from '../di-tokens.js';

const shoePoints = ['M', 16, 8, 'A', 8, 8, 0, 1, 0, 0, 8].join(' ');

const HorizontalShoe: React.FC<{ x: number; y: number; isSelected: boolean }> = observer(({ x, y, isSelected }) => {
  const scheme = useService(TOKEN_SCHEME);
  const theme = scheme.theme.value;
  return (
    <svg
      style={{
        position: 'absolute',
        left: x - 9,
        top: y - 9,
        stroke: isSelected ? theme.selectedBorderColor : theme.iconBorderColor,
        strokeWidth: 2,
      }}
      width={18}
      height={10}
      viewBox="-1 -1 18 10"
    >
      <path
        d={shoePoints}
        fill="none"
        style={{ fill: 'none' }}
        className={`connection-line ${isSelected ? ' selected' : ''}`}
      />
    </svg>
  );
});

export const HorisontalLine: React.FC<{
  line: IHorisontalLine;
  isSelected: boolean;
  arrowAtEnd?: boolean;
  dashed?: boolean;
}> = ({ line, isSelected, dashed }) => {
  const realX1 = line.shoe ? line.x1 + 8 : line.x1;
  const realX2 = line.nextShoe ? line.x2 - 8 : line.x2;
  /*const d = [
    "M", line.x1 + 8, line.y,
    "A", 8, 8, 0, 1, 0, line.x1 - 8, line.y
  ].join(" ");*/
  const left = Math.min(realX1, realX2) - 1;
  const width = Math.abs(realX1 - realX2) + 2;
  return (
    <>
      <div
        className={`horizontal-line${isSelected ? ' selected' : ''}${dashed ? ' dashed' : ''}`}
        style={{
          left,
          top: line.y - 1,
          width,
        }}
      />
      {line.shoe ? <HorizontalShoe isSelected={isSelected} x={line.x1} y={line.y} /> : null}
    </>
  );
};
