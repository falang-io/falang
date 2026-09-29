import { CELL_SIZE } from '../../constants.js';
import type { ContourFunctionIconStore } from './contour-function.icon.store.js';

export interface ICalculateFunctionReturnLinesResultItem {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  y3: number;
}

export const calculateContourFunctionReturnLines = (icon: ContourFunctionIconStore) => {
  const skewerOutlines = icon.filteredOutLines;
  const outlinesLength = skewerOutlines.length;
  const returns = icon.footer.threads.icons;
  const returnsLength = returns.length;
  if (!returnsLength || !outlinesLength) return [];
  const returnValue: ICalculateFunctionReturnLinesResultItem[] = [];
  const skewerEndY = icon.body.skewer.y + icon.body.skewer.height;
  skewerOutlines.forEach((outline, index) => {
    if (index === 0) {
      returnValue.push({
        x1: icon.x,
        x2: icon.x,
        y1: outline.y,
        y2: returns[index].y,
        y3: returns[index].y,
      });
      return;
    }
    const ret = returns[outline.level - 1];
    if (!ret) return;
    if (outline.level === 1) {
      returnValue.push({
        x1: outline.x,
        x2: icon.x,
        y1: outline.y,
        y2: skewerEndY,
        y3: skewerEndY,
      });
      return;
    }
    const returnY = ret.y;
    const returnX = ret.x;
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
};
