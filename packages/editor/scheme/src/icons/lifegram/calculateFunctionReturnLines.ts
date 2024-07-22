import { CELL_SIZE } from '../../common/constants';
import { LifegramFunctionIconStore } from './LifeGramFunction.icon.store';

export interface ICalculateFunctionReturnLinesResultItem {
  x1: number
  x2: number
  y1: number
  y2: number
  y3: number
}

export const calculateFunctionReturnLines = (icon: LifegramFunctionIconStore) => {
  const skewerOutlines = icon.filteredOutLines;
  const outlinesLength = skewerOutlines.length;
  const returns = icon.threadsFooter.threads.icons;
  const returnsLength = returns.length;  
  if(!returnsLength || !outlinesLength) return [];
  const returnValue: ICalculateFunctionReturnLinesResultItem[] = [];
  const skewerEndY = icon.skewer.position.y + icon.skewer.shape.height;
  skewerOutlines.forEach((outline, index) => {    
    if(index === 0) {
      returnValue.push({
        x1: icon.position.x,
        x2: icon.position.x,
        y1: outline.y,
        y2: returns[index].position.y,
        y3: returns[index].position.y,
      });
      return;
    }
    const ret = returns[outline.level - 1];
    if(!ret) return;
    if(outline.level === 1) {
      returnValue.push({
        x1: outline.x,
        x2: icon.position.x,
        y1: outline.y,
        y2: skewerEndY,
        y3: skewerEndY,
      });      
      return;
    }
    const returnY = ret.position.y;
    const returnX = ret.position.x;
    const y2 = returnX > outline.x ? outline.y : skewerEndY + (index - 1) * CELL_SIZE;
    returnValue.push({
      x1: outline.x,
      x2: returnX,
      y1: outline.y,
      y2,
      y3: returnY,
    });
  });
  return returnValue;
}