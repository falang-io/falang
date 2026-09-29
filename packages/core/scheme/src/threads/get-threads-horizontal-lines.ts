import type { IHorisontalLine } from '../types/horizontal-line.js';
import type { ThreadsStore } from './threads.store.js';

export const getThreadsHorizontalLines = (store: ThreadsStore): IHorisontalLine[] => {
  if (store.disableOutlines) return [];
  const wasItems = new Set<string>();
  const returnValue: IHorisontalLine[] = [];
  const extendedOutlines = store.totalOutlinesExtended;
  for (let i = 0; i < extendedOutlines.length; i += 1) {
    const extItem = extendedOutlines[i];
    if (extItem.outLine.type === 'throw') continue;
    const item = extItem.outLine;
    const hash = `${item.type}${item.level}`;
    if (wasItems.has(hash)) continue;
    wasItems.add(hash);
    let currentX = item.x;
    let wasShoe = false;
    const y = extItem.finalY;
    for (let j = i + 1; j < extendedOutlines.length && currentX < extItem.finishX; j += 1) {
      const currentExtItem = extendedOutlines[j];
      if (currentExtItem.outLine.type === 'throw') continue;
      if (currentExtItem.order === extItem.order) {
        returnValue.push({
          nextShoe: false,
          shoe: wasShoe,
          targetId: extItem.outLine.targetId,
          //type: extItem.outLine.type,
          x1: currentX,
          x2: currentExtItem.outLine.x,
          y,
        });
        currentX = currentExtItem.outLine.x;
        wasShoe = false;
        continue;
      }
      if (currentExtItem.finalY > y) {
        returnValue.push({
          nextShoe: true,
          shoe: wasShoe,
          targetId: extItem.outLine.targetId,
          //type: extItem.outLine.type,
          x1: currentX,
          x2: currentExtItem.outLine.x,
          y,
        });
        currentX = currentExtItem.outLine.x;
        wasShoe = true;
      }
    }
    if (currentX < extItem.finishX) {
      returnValue.push({
        nextShoe: false,
        shoe: wasShoe,
        targetId: extItem.outLine.targetId,
        //type: extItem.outLine.type,
        x1: currentX,
        x2: extItem.finishX,
        y,
      });
    }
  }
  return returnValue;
};
