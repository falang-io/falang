import type { IIconOutLine } from '../types/icon-outline.js';
import type { ThreadsStore } from './threads.store.js';

export const getThreadsIconOutlines = (store: ThreadsStore): IIconOutLine[] => {
  if (store.disableOutlines) return [];
  const wasItems = new Set<string>();
  const returnValue: IIconOutLine[] = [];
  const extendedOutlines = store.totalOutlinesExtended;
  for (const extItem of extendedOutlines) {
    const item = extItem.outLine;
    if (item.type === 'main') continue;
    const hash = `${item.type}${item.level}`;
    if (wasItems.has(hash)) continue;
    wasItems.add(hash);
    returnValue.push({
      level: item.level,
      targetId: item.targetId,
      type: item.type,
      x: extItem.finishX,
      y: extItem.finalY,
      sourceId: extItem.outLine.sourceId,
    });
  }
  return returnValue;
};
