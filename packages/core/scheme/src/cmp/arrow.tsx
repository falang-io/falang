import type React from 'react';
import { observer } from 'mobx-react-lite';
import { useService } from '../hooks/use-service.js';
import { TOKEN_SCHEME } from '../di-tokens.js';

export type TArrowDirection = 'left' | 'right' | 'top' | 'bottom';

interface TArrowParams {
  dir: TArrowDirection;
  x: number;
  y: number;
  selected: boolean;
}

export const Arrow: React.FC<TArrowParams> = observer(({ dir, x, y, selected }) => {
  const scheme = useService(TOKEN_SCHEME);
  const theme = scheme.theme.value;
  const className = selected ? 'connection-line selected connection-arrow' : 'connection-line connection-arrow';
  let arrowProps: React.CSSProperties = {};
  const color = selected ? theme.selectedBorderColor : theme.iconBorderColor;
  switch (dir) {
    case 'bottom': {
      arrowProps = {
        borderTop: `12px solid ${color}`,
        borderLeft: `3px solid transparent`,
        borderRight: `3px solid transparent`,
        left: x - 3,
        top: y - 12,
      };
      break;
    }
    case 'top': {
      arrowProps = {
        borderBottom: `12px solid ${color}`,
        borderLeft: `3px solid transparent`,
        borderRight: `3px solid transparent`,
        left: x - 3,
        top: y,
      };
      break;
    }
    case 'left': {
      arrowProps = {
        borderRight: `12px solid ${color}`,
        borderTop: `3px solid transparent`,
        borderBottom: `3px solid transparent`,
        left: x,
        top: y - 3,
      };
      break;
    }
    case 'right': {
      arrowProps = {
        borderLeft: `12px solid ${color}`,
        borderTop: `3px solid transparent`,
        borderBottom: `3px solid transparent`,
        left: x - 12,
        top: y - 3,
      };
      break;
    }
    default:
  }
  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        ...arrowProps,
      }}
    />
  );
});
