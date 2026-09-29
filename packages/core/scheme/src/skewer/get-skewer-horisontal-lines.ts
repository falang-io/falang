import type { IHorisontalLine } from '../types/horizontal-line.js';
import type { SkewerStore } from './skewer.store.js';

export const getSkewerHorisontalLines = (skewer: SkewerStore): IHorisontalLine[] => {
  const extended = skewer.totalOutlinesExtended;
  const verticalLines = skewer.verticalLines;
  const returnValue: IHorisontalLine[] = [];
  extended.forEach((ext) => {
    if (ext.outLine.type === 'throw') return;
    const x1 = ext.outLine.x;
    const x2 = ext.finalX;
    const y = ext.outLine.y;
    const xBetween: number[] = [];
    for (const v of verticalLines) {
      if (v.x <= x1) continue;
      if (v.x >= x2) continue;
      if (y <= v.y1) continue;
      if (y >= v.y2) continue;
      xBetween.push(v.x);
    }
    for (let i = 0; i <= xBetween.length; i += 1) {
      const lx1 = i === 0 ? x1 : xBetween[i - 1];
      const lx2 = i === xBetween.length ? x2 : xBetween[i];
      const shoe = i > 0;
      const nextShoe = i < xBetween.length;
      returnValue.push({
        targetId: ext.outLine.targetId,
        //type: ext.outLine.type,
        x1: lx1,
        y: ext.outLine.y,
        x2: lx2,
        nextShoe,
        shoe,
      });
    }
  });
  return returnValue;
};
