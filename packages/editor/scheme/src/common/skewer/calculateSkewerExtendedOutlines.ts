import { IIconOutLine } from '../outs/TOutType';
import { CELL_SIZE } from '../constants';
import { getOrderByTypeAndLevel } from '../utils/getOrderByTypeAndLevel';
import { SkewerStore } from './Skewer.store';

export const calcualteSkewerExtendedOutlines = (skewer: SkewerStore): ISkewerOutlineExtended[] => {
  const maxXByIndex: number[] = [];
  const skewerX = skewer.position.x;
  skewer.icons.forEach((icon) => {
    maxXByIndex.push(skewerX + icon.shape.rightSize);
  });
  const extended: ISkewerOutlineExtended[] = [];
  let index = 0;
  skewer.icons.forEach((icon, iconIndex) => {
    const outLines = icon.iconOutLines.slice().sort((a, b) => a.y - b.y);
    outLines.forEach((outLine) => {
      if(outLine.type === 'main') return;
      let finalX = Math.max(outLine.x, maxXByIndex[iconIndex] + CELL_SIZE);
      const isExtreme = outLine.type === 'continue' && skewer.parent.isExtremeForContinueLevel(outLine.level);
      if(isExtreme) {
        let prevMaxX = Math.max(
          skewerX,
          ...maxXByIndex.slice(0, iconIndex),
        );
        finalX = Math.max(prevMaxX + CELL_SIZE, finalX);
      } else {
        const nextMaxX = Math.max(
          skewerX,
          ...maxXByIndex.slice(iconIndex + 1),
        );
        finalX = Math.max(nextMaxX + CELL_SIZE, outLine.x);
      }
      extended.push({
        outLine,
        finalX,
        finalY: outLine.y,
        hash: `${outLine.type}${outLine.level}`,
        index,
        order: getOrderByTypeAndLevel(outLine.type, outLine.level),
        isExtreme,
      });
      index++;
    });
  });

  const outsByHash: Record<string, ISkewerOutlineExtended> = {};
  for(const item of extended) {
    if(item.hash in outsByHash && item.finalX <= outsByHash[item.hash].finalX) continue;
    outsByHash[item.hash] = item;
  }

  const orderedFilteredOuts = Object.values(outsByHash).sort((a, b) => a.order - b.order);

  for(const currentExtItem of orderedFilteredOuts) {
    let finalX = currentExtItem.finalX;
    let finalY = currentExtItem.finalY;
    for(let i = 0; i < extended.length; i++) {
      if(i === currentExtItem.index) continue;
      const extItem = extended[i];
      //if(extItem.isExtreme) continue;
      const item = extItem.outLine;
      if(extItem.order > currentExtItem.order) {
        finalX = Math.max(extItem.finalX + CELL_SIZE, finalX)
      }
      else if(extItem.order === currentExtItem.order) {
        finalX = Math.max(finalX, item.x);
      }
      if(item.type !== 'main' && extItem.order < currentExtItem.order) finalY = Math.max(extItem.finalY + CELL_SIZE, finalY);
      if(item.type === currentExtItem.outLine.type && item.level === currentExtItem.outLine.level) {
        finalY = Math.max(finalY, item.y);
      } else if (item.type === 'main' && i > currentExtItem.index) {
        finalY = Math.max(finalY, extItem.finalY + CELL_SIZE);
      } 
    }
    extended.forEach((item) => {
      if(item.order === currentExtItem.order) {
        item.finalX = finalX;
        item.finalY = finalY;
      }
    });
  }

  /**
   * Повторяем для continue
   */
  for(const currentExtItem of orderedFilteredOuts) {
    if(currentExtItem.outLine.type !== 'continue') continue;
    let finalX = currentExtItem.finalX;
    for(let i = 0; i < extended.length; i++) {
      if(i === currentExtItem.index) continue;
      const extItem = extended[i];
      //if(extItem.isExtreme) continue;
      const item = extItem.outLine;
      if(extItem.order > currentExtItem.order) {
        finalX = Math.max(extItem.finalX + CELL_SIZE, finalX)
      }
      else if(extItem.order === currentExtItem.order) {
        finalX = Math.max(finalX, item.x);
      } 
    }
    extended.forEach((item) => {
      if(item.order === currentExtItem.order) {
        item.finalX = finalX;
      }
    });
  }
  // console.log('calcualteSkewerExtendedOutlines', skewer.parentId, extended);
  return extended;
};

export interface ISkewerOutlineExtended {
  outLine: IIconOutLine,
  //startY: number,
  finalY: number
  //nextMaxX: number
  order: number
  finalX: number
  hash: string
  index: number
  isExtreme: boolean
}
