import { IBlockLine } from '../../IBlockLine';

export const InBlockLineComponent: React.FC<IBlockLine> = ({ dx1, dx2, dy1, dy2 }) => {
  return <line
    className='inblock-line'
    x1={dx1}
    x2={dx2}
    y1={dy1}
    y2={dy2}
  />;
};
