// oxlint-disable no-bitwise
import type { ContourIconStore } from './icons/contour/contour.icon.store.js';
import type { CycleIconStore } from './icons/cycle/cycle.icon.store.js';
import type { FunctionBodyIconStore } from './icons/function/function-body.icon.store.js';
import type { IfIconStore } from './icons/if/if.icon.store.js';
import type { OutIconStore } from './icons/out/out.icon.store.js';
import type { WhileIconStore } from './icons/while/while.icon.store.js';
import type { IconWithSkewerStore } from './skewer/icon-with-skewer.store.js';
import type { IconStore } from './store/icon.store.js';
import type { IconWithThreadsStore } from './threads/icon-with-threads.store.js';
import { IconFlags } from './types/icon-flags.js';
import type { IIconWithList } from './types/icon-list.js';
import type { IIconWithLines, IIconWithOwnLines } from './types/icon-with-lines.js';

export type IIconStoreWithChildren = IconStore & { children: readonly IconStore[] };
export type IIconStoreWithFixedChildren = IIconStoreWithChildren & { setChildren(children: IconStore[]): void };

const hasFlag = (icon?: IconStore | null, flag: IconFlags = IconFlags.None): boolean => {
  if (!icon) return false;
  return Boolean(icon.flags & flag);
};

export const checker = {
  isWithList(icon: IconStore | null | undefined): icon is IIconWithList {
    if (!icon) return false;
    return Boolean(icon.flags & IconFlags.List);
  },
  isWithChildren(icon?: IconStore | null): icon is IIconStoreWithChildren {
    if (!icon) return false;
    return Boolean(icon.flags & IconFlags.WithChildren);
  },
  isWithFixedChildren(icon?: IconStore | null): icon is IIconStoreWithFixedChildren {
    if (!icon) return false;
    return Boolean(icon.flags & IconFlags.WithFixedChildren);
  },
  isWithSkewer(icon?: IconStore): icon is IconWithSkewerStore {
    return hasFlag(icon, IconFlags.Skewer);
  },
  isCycle(icon?: IconStore | null): icon is CycleIconStore {
    return hasFlag(icon, IconFlags.Cycle);
  },
  isFunctionBody(icon?: IconStore): icon is FunctionBodyIconStore {
    return hasFlag(icon, IconFlags.FunctionBody);
  },
  isWithThreads(icon?: IconStore | null): icon is IconWithThreadsStore {
    return hasFlag(icon, IconFlags.Threads);
  },
  hasFlag(icon?: IconStore | null, flag: IconFlags = IconFlags.None): boolean {
    return hasFlag(icon, flag);
  },
  isContour(icon?: IconStore | null): icon is ContourIconStore {
    return hasFlag(icon, IconFlags.Contour);
  },
  isOut(icon?: IconStore | null): icon is OutIconStore {
    return hasFlag(icon, IconFlags.Out);
  },
  isIf(icon?: IconStore | null): icon is IfIconStore {
    return hasFlag(icon, IconFlags.If);
  },
  isWhile(icon?: IconStore | null): icon is WhileIconStore {
    return hasFlag(icon, IconFlags.While);
  },
  ownLines(icon?: IconStore | null): icon is IIconWithOwnLines {
    return hasFlag(icon, IconFlags.WithOwnLines);
  },
  haveLines(icon?: IconStore | null): icon is IIconWithLines {
    return hasFlag(icon, IconFlags.WithLines);
  },
} as const;
