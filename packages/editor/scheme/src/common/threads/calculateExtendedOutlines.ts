import { IIconOutLine, TIconOutLineType } from '../outs/TOutType';
import { CELL_SIZE } from '../constants';
import { getOrderByTypeAndLevel } from '../utils/getOrderByTypeAndLevel';

export const calculateExtendedOutlines = (totalOutlines: IIconOutLine[]) => {
  if(!totalOutlines.length) return [];

  const extended: IIconOutlineExtended[] = totalOutlines.map((outLine, index) => {
    return {
      outLine,
      finalY: outLine.y,
      order: getOrderByTypeAndLevel(outLine.type, outLine.level),
      finishX: outLine.x,
      hash: `${outLine.type}${outLine.level}`,
      index,
    }
  });

  const outsByHash: Record<string, IIconOutlineExtended> = {};
  for(const item of extended) {
    if(item.outLine.type === 'throw') continue;
    if(item.hash in outsByHash || item.outLine.type === 'main') continue;
    outsByHash[item.hash] = item;
  }

  const orderedFilteredOuts = Object.values(outsByHash).sort((a, b) => a.order - b.order);

  let hasExtraMain = false;

  let mainY = totalOutlines[0].y;
  let maxMainX = totalOutlines[0].x;

  for(let i = 1; i < extended.length; i++) {
    if(extended[i].outLine.type === 'main') {
      hasExtraMain = true;
    }  
  }

  if(hasExtraMain) {
    let mainY2 = mainY;
    for(let i = 1; i < extended.length; i++) {
      mainY2 = Math.max(extended[i].outLine.y, mainY2);
      if(extended[i].outLine.type === 'main') {
        mainY = mainY2;
        maxMainX = extended[i].outLine.x;
      }
    } 
  }


  // устанавливаем y для main
  for(let i = 0; i < extended.length; i++) {
    const item = extended[i];
    if(item.outLine.type === 'main') {
      item.finalY = mainY;
      item.finishX = maxMainX;
    }
  }

  for(const currentExtItem of orderedFilteredOuts) {
    const firstIndex = currentExtItem.index;
    let finalY = totalOutlines[firstIndex].y;
    const currentLevel = currentExtItem.outLine.level;
    for(let i = 0; i < totalOutlines.length; i++) {
      if(i === firstIndex) continue;
      const extItem = extended[i];
      const item = extItem.outLine;
      if(i > firstIndex) finalY = Math.max(finalY, item.y);
      if(item.type !== 'main' && extItem.order < currentExtItem.order) finalY = Math.max(extItem.finalY + CELL_SIZE, finalY);
      if(item.type === currentExtItem.outLine.type && item.level === currentLevel) {
        finalY = Math.max(finalY, item.y);
      } else if (item.type === 'main' && i > firstIndex) {
        finalY = Math.max(finalY, extItem.finalY + CELL_SIZE);
        if(finalY === mainY) {
          finalY += CELL_SIZE;
        }
      } 
    }
    extended.forEach((item) => {
      if(item.outLine.type === currentExtItem.outLine.type && item.outLine.level === currentLevel) {
        item.finalY = finalY;
      }
    })
  }

  for(let i = orderedFilteredOuts.length - 1; i >= 0; i--) {
    const currentExtItem = orderedFilteredOuts[i];
    const firstIndex = currentExtItem.index;
    const currentLevel = currentExtItem.outLine.level;
    let finishX = totalOutlines[firstIndex].x;
    for(let i = 0; i < totalOutlines.length; i++) {
      if(i === firstIndex) continue;
      const extItem = extended[i];
      const item = extItem.outLine;
      if(item.type !== 'main') {
        if(extItem.order === currentExtItem.order) {
          finishX = Math.max(finishX, extItem.finishX);
        }
        if(extItem.order > currentExtItem.order) {
          finishX = Math.max(finishX, extItem.finishX + CELL_SIZE);
        }
      }
    }
    extended.forEach((item) => {
      if(item.outLine.type === currentExtItem.outLine.type && item.outLine.level === currentLevel) {
        item.finishX = finishX;
      }
    })
  }

/*
  if(minContinueLevel > 0 && maxContinueLevel > 0) {
    for(let currentContinueLevel = minContinueLevel; currentContinueLevel <= maxContinueLevel; currentContinueLevel++) {
      const firstIndex = totalOutlines.findIndex((item) => item.type === 'continue' && item.level === currentContinueLevel);
      if(firstIndex === -1) continue;
      let finalY = totalOutlines[firstIndex].y;
      const currentExtItem = extended[firstIndex];
      for(let i = 0; i < totalOutlines.length; i++) {
        if(i === firstIndex) continue;
        const extItem = extended[i];
        const item = extItem.outLine;
        if(i > firstIndex) finalY = Math.max(finalY, item.y);
        if(item.type !== 'main' && extItem.order < currentExtItem.order) finalY = Math.max(extItem.finalY + CELL_SIZE, finalY);
        if(item.type === 'continue' && item.level === currentContinueLevel) {
          finalY = Math.max(finalY, item.y);
        } else if (item.type === 'main' && i > firstIndex) {
          finalY = Math.max(finalY, extItem.finalY + CELL_SIZE);
          if(finalY === mainY) {
            finalY += CELL_SIZE;
          }
        } 
      }
      extended.forEach((item) => {
        if(item.outLine.type === 'continue' && item.outLine.level === currentContinueLevel) {
          item.finalY = finalY;
        }
      })
    }
  }

  if(minReturnLevel > 0 && maxReturnLevel > 0) {
    for(let currentReturnLevel = maxReturnLevel; currentReturnLevel >= minReturnLevel; currentReturnLevel--) {
      const firstIndex = totalOutlines.findIndex((item) => item.type === 'return' && item.level === currentReturnLevel);
      if(firstIndex === -1) continue;
      let finalY = totalOutlines[firstIndex].y;
      const currentExtItem = extended[firstIndex];
      for(let i = 0; i < totalOutlines.length; i++) {
        if(i === firstIndex) continue;
        const extItem = extended[i];          
        const item = extItem.outLine;
        if(i > firstIndex) finalY = Math.max(finalY, item.y);
        if(item.type !== 'main' && extItem.order < currentExtItem.order) finalY = Math.max(extItem.finalY + CELL_SIZE, finalY);
        if(item.type === 'return' && item.level === currentReturnLevel) {
          finalY = Math.max(finalY, item.y);
        } else if (item.type === 'main' && i > firstIndex) {
          finalY = Math.max(finalY, extItem.finalY + CELL_SIZE);
          if(finalY === mainY) {
            finalY += CELL_SIZE;
          }
        }
      }
      extended.forEach((item) => {
        if(item.outLine.type === 'return' && item.outLine.level === currentReturnLevel) {
          item.finalY = finalY;
        }
      })
    }
  }

  if(minBreakLevel > 0 && maxBreakLevel > 0) {
    for(let currentBreakLevel = maxBreakLevel; currentBreakLevel >= minBreakLevel; currentBreakLevel--) {
      const firstIndex = totalOutlines.findIndex((item) => item.type === 'break' && item.level === currentBreakLevel);
      if(firstIndex === -1) continue;
      let finalY = totalOutlines[firstIndex].y;
      const currentExtItem = extended[firstIndex];
      for(let i = 0; i < totalOutlines.length; i++) {
        if(i === firstIndex) continue;
        const extItem = extended[i];          
        const item = extItem.outLine;
        if(i > firstIndex) finalY = Math.max(finalY, item.y);
        if(item.type !== 'main' && extItem.order < currentExtItem.order) finalY = Math.max(extItem.finalY + CELL_SIZE, finalY);
        if(item.type === 'break' && item.level === currentBreakLevel) {
          finalY = Math.max(finalY, item.y);
        } else if (item.type === 'main' && i > firstIndex) {
          finalY = Math.max(finalY, item.y + CELL_SIZE);
          if(finalY === mainY) {
            finalY += CELL_SIZE;
          }
        }
      }
      extended.forEach((item) => {
        if(item.outLine.type === 'break' && item.outLine.level === currentBreakLevel) {
          item.finalY = finalY;
        }
      })
    }
  }
*/
  /**
   * Считаем finishX
   */
  /*
  if(minBreakLevel > 0 && maxBreakLevel > 0) {
    for(let currentBreakLevel = minBreakLevel; currentBreakLevel <= maxBreakLevel; currentBreakLevel++) {
      const firstIndex = totalOutlines.findIndex((item) => item.type === 'break' && item.level === currentBreakLevel);
      if(firstIndex === -1) continue;
      const currentExtItem = extended[firstIndex];
      let finishX = totalOutlines[firstIndex].x;
      for(let i = 0; i < totalOutlines.length; i++) {
        if(i === firstIndex) continue;
        const extItem = extended[i];          
        const item = extItem.outLine;
        if(item.type !== 'main') {
          if(extItem.order === currentExtItem.order) {
            finishX = Math.max(finishX, extItem.finishX);
          }
          if(extItem.order > currentExtItem.order) {
            finishX = Math.max(finishX, extItem.finishX + CELL_SIZE);
          }
        }
      }
      extended.forEach((item) => {
        if(item.outLine.type === 'break' && item.outLine.level === currentBreakLevel) {
          item.finishX = finishX;
        }
      })
    }
  }

  if(minReturnLevel > 0 && maxReturnLevel > 0) {
    for(let currentReturnLevel = maxReturnLevel; currentReturnLevel >= minReturnLevel; currentReturnLevel--) {
      const firstIndex = totalOutlines.findIndex((item) => item.type === 'return' && item.level === currentReturnLevel);
      if(firstIndex === -1) continue;
      let finishX = totalOutlines[firstIndex].x;
      const currentExtItem = extended[firstIndex];
      for(let i = 0; i < totalOutlines.length; i++) {
        if(i === firstIndex) continue;
        const extItem = extended[i];          
        const item = extItem.outLine;
        if(item.type !== 'main') {
          if(extItem.order === currentExtItem.order) {
            finishX = Math.max(finishX, extItem.finishX);
          }
          if(extItem.order > currentExtItem.order) {
            finishX = Math.max(finishX, extItem.finishX + CELL_SIZE);
          }
        }
      }
      extended.forEach((item) => {
        if(item.outLine.type === 'return' && item.outLine.level === currentReturnLevel) {
          item.finishX = finishX;
        }
      })
    }
  }

  if(minContinueLevel > 0 && maxContinueLevel > 0) {
    for(let currentContinueLevel = maxContinueLevel; currentContinueLevel >= minContinueLevel; currentContinueLevel--) {
      const firstIndex = totalOutlines.findIndex((item) => item.type === 'continue' && item.level === currentContinueLevel);
      if(firstIndex === -1) continue;
      let finishX = totalOutlines[firstIndex].x;
      const currentExtItem = extended[firstIndex];
      for(let i = 0; i < totalOutlines.length; i++) {
        if(i === firstIndex) continue;
        const extItem = extended[i];
        const item = extItem.outLine;
        if(item.type !== 'main') {
          if(extItem.order === currentExtItem.order) {
            finishX = Math.max(finishX, extItem.finishX);
          }
          if(extItem.order > currentExtItem.order) {
            finishX = Math.max(finishX, extItem.finishX + CELL_SIZE);
          }
        }
      }
      console.log('levl', currentContinueLevel, 'finish', finishX);
      extended.forEach((item) => {
        if(item.outLine.type === 'continue' && item.outLine.level === currentContinueLevel) {
          item.finishX = finishX;
        }
      })
    }
  }

*/

  return extended;
}


export interface IIconOutlineExtended {
  outLine: IIconOutLine,
  //startY: number,
  finalY: number
  order: number
  finishX: number
  hash: string
  index: number
}
