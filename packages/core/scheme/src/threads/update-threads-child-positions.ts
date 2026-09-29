import { checker } from '../checker.js';
import { CELL_SIZE } from '../constants.js';
import type { IconStore } from '../store/icon.store.js';
import type { ThreadsStore } from './threads.store.js';

export const updateThreadsChildPositions = (store: ThreadsStore, startIndex = 0) => {
  let prevIcon: IconStore | null = startIndex === 0 ? null : store.icons[startIndex - 1];
  const length = store.icons.length;
  for (let i = startIndex; i < length; i += 1) {
    const index = i;
    const currentIcon: IconStore = store.icons[i];
    if (checker.isWithSkewer(currentIcon)) {
      currentIcon.list.isFirst = i === 0;
      currentIcon.list.isLast = i === length - 1;
    }
    const isSecond = i === 1;
    if (prevIcon) {
      const currentPrevIcon = prevIcon;
      currentIcon.setPosition({
        x: () => {
          let x = currentPrevIcon.x + currentPrevIcon.right + currentIcon.left + CELL_SIZE;
          if (isSecond) {
            x = Math.max(store.x + store.minimalSecondDx(), x + (store.gaps[0] ?? 0) * CELL_SIZE);
          } else if (index > 1) {
            x += (store.gaps[index - 1] ?? 0) * CELL_SIZE;
          }
          return x;
        },
        y: () => {
          if (store.verticalAlign === 'top') {
            return store.y;
          }
          return store.y + store.iconsMaxHeight - currentIcon.height;
        },
      });
    } else {
      currentIcon.setPosition({
        x: () => store.x,
        y: () => {
          if (store.verticalAlign === 'top') {
            return store.y;
          }
          return store.y + store.iconsMaxHeight - currentIcon.height;
        },
      });
    }
    prevIcon = currentIcon;
  }
};
