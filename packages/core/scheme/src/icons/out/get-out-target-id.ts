import { checker } from '../../checker.js';
import type { IconStore } from '../../store/icon.store.js';
import type { CycleIconStore } from '../cycle/cycle.icon.store.js';
import type { FunctionBodyIconStore } from '../function/function-body.icon.store.js';
import type { OutIconStore } from './out.icon.store.js';

const findFunctionBody = (store: IconStore): FunctionBodyIconStore | null => {
  const parent = store.parent;
  if (!parent) return null;
  if (checker.isFunctionBody(parent)) return parent;
  return findFunctionBody(parent);
};

const findCycle = (store: IconStore, level: number): CycleIconStore | null => {
  const parent = store.parent;
  if (!parent) return null;
  if (checker.isCycle(parent)) {
    if (level === 1) return parent;
    return findCycle(parent, level - 1);
  }
  return findCycle(parent, level);
};

export const getOutIconTargetId = (store: OutIconStore): string | null => {
  if (store.type === 'throw') return null;
  if (store.type === 'return') {
    return findFunctionBody(store)?.id ?? null;
  }
  return findCycle(store, store.level)?.id ?? null;
};
