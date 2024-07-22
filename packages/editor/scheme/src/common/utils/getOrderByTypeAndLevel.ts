import { TIconOutLineType } from '../outs/TOutType';

export const getOrderByTypeAndLevel = (type: TIconOutLineType, level: number): number => {
  if(type === 'main') return -100;
  switch (type) {
    case 'continue': return level;
    case 'return': return 100 - level;
    case 'break': return 200 - level;
    case 'throw' : return 0;
  }
}