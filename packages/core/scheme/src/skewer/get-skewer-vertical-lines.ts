import type { IVerticalLine } from '../types/vertical-line.js';
import type { SkewerStore } from './skewer.store.js';

export const getSkewerVerticalLines = (skewer: SkewerStore): IVerticalLine[] => {
  const wasHash = new Set<string>();
  const extended = skewer.totalOutlinesExtended;
  const returnValue: IVerticalLine[] = [];
  for (let i = 0; i < extended.length; i += 1) {
    const currentItem = extended[i];
    if (currentItem.outLine.type === 'throw') continue;
    if (wasHash.has(currentItem.hash)) continue;
    wasHash.add(currentItem.hash);
    let minY = currentItem.outLine.y;
    let maxY = currentItem.finalY;
    for (let j = i + 1; j < extended.length; j += 1) {
      const item = extended[j];
      if (item.order !== currentItem.order) continue;
      minY = Math.min(minY, item.outLine.y);
      maxY = Math.max(maxY, item.finalY);
    }
    if (maxY === minY) continue;
    returnValue.push({
      targetId: currentItem.outLine.targetId,
      type: currentItem.outLine.type,
      x: currentItem.finalX,
      y1: minY,
      y2: maxY,
    });
  }
  returnValue.sort((a, b) => a.x - b.x);
  return returnValue;
};
