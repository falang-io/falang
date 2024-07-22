import { CELL_SIZE } from '../../constants';
import { IBlockBadge } from '../../IBlockBadge';
import { schemeBaseTextStyle } from '../../text/styles';

export const InBlockBadgeComponent: React.FC<IBlockBadge> = ({ dx, dy, text }) => {
  return <text
    className='inblock-text'
    style={schemeBaseTextStyle}
    x={dx + 4}
    y={dy + CELL_SIZE - 4}
  >
    {text}
  </text>
};
