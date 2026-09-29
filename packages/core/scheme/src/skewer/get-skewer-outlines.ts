import type { IIconOutLine } from '../types/icon-outline.js';
import { isExtremeForContinueLevel } from '../utils/is-extreme-for-continue-level.js';
import type { ISkewerOutlineExtended } from './calculate-skewer-extended-outlines.js';
import type { SkewerStore } from './skewer.store.js';

export const getSkewerOutLines = (skewer: SkewerStore): IIconOutLine[] => {
  const returnValue: IIconOutLine[] = [];
  const extended = skewer.totalOutlinesExtended;
  const wasItems: Record<string, ISkewerOutlineExtended> = {};
  for (let i = extended.length - 1; i >= 0; i -= 1) {
    const item = extended[i];
    if (wasItems[item.hash]) {
      if (item.outLine.type !== 'continue' || item.finalY > wasItems[item.hash].finalY) {
        continue;
      }
      if (!isExtremeForContinueLevel(skewer.parent, item.outLine.level)) {
        continue;
      }
    }
    wasItems[item.hash] = item;
    returnValue.push({
      level: item.outLine.level,
      targetId: item.outLine.targetId,
      type: item.outLine.type,
      x: item.finalX,
      y: item.finalY,
      sourceId: item.outLine.sourceId,
    });
  }

  const outItem = skewer.out;
  if (outItem && !skewer.isFirst) {
    returnValue.push({
      level: outItem.level,
      type: outItem.type,
      x: skewer.x,
      y: skewer.y + skewer.height,
      targetId: outItem.targetId || '',
      sourceId: outItem.id,
    });
  } else {
    returnValue.push({
      level: 1,
      type: 'main',
      x: skewer.x,
      y: skewer.y + skewer.height,
      targetId: '',
      sourceId: skewer.parentId,
    });
  }
  return returnValue;
};
