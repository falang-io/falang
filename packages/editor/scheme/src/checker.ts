import type { IIconList, IIconWithList } from './icons/base/IIconList';
import type { IconStore } from './icons/base/Icon.store';
import type { ThreadsIconStore } from './common/threads/ThreadsIconStore';
import type { IconWithSkewerStore } from './common/skewer/IconWithSkewer.store';
import type { OutStore } from './common/outs/Out.store';
import type { CycleIconStore } from './icons/cycle/Cycle.icon.store';
import { FunctionIconStore } from './icons/function/Function.icon.store';
import { SwitchTransformer } from './icons/switch/Switch.transformer';
import { ParallelIconTransformer } from './icons/parallel/Parallel.icon.transformer';
import { LifegramTransformer } from './icons/lifegram/LifeGram.transformer';
import { LifeGramIconStore } from './icons/lifegram/LifeGram.icon.store';
import { BlockStore } from './common/blocks/store/BlocksStore';
import { IBlockWithAutoComplete } from './interfaces/IBlockWithAutoComplete';

export const checker = {
  isThreads: (icon?: IconStore | null): icon is ThreadsIconStore => {
    return !!icon?.isThreads();
  },
  isIconWithSkewer: (icon?: IconStore | null): icon is IconWithSkewerStore => {
    return !!icon?.isIconWithSkewer();
  },
  isOut: (icon?: IconStore | null): icon is OutStore => {
    return !!icon?.isOut();
  },
  isFunction(icon?: IconStore | null): icon is FunctionIconStore {
    return !!icon?.isFunction();
  },
  isCycle(icon?: IconStore | null): icon is CycleIconStore {
    return !!icon?.isCycle();
  },
  isIconWithList(icon?: IconStore | null): icon is (IIconWithList & IconStore) {
    return !!icon?.isIconWithSkewer() || !!icon?.isThreads();
  },
  isInFunction(icon?: IconStore | null): boolean {
    if(!icon) return false;
    return icon.canHaveReturn();
  },
  isSwitchTransformer(value?: any): value is SwitchTransformer {
    return value && !!value.isSwitchTransformer;
  },
  isParallelTransformer(value?: any): value is ParallelIconTransformer {
    return value && !!value.isParallelIconTransformer;
  },
  isLifegramTransformer(value?: any): value is LifegramTransformer {
    return value && !!value.isLifeGramTransformer;
  },
  isLifeGramStore(value?: any): value is LifeGramIconStore {
    return value && !!value.isLifeGramIcon;
  },
  isBlockWithAutoComplete(block: BlockStore): block is IBlockWithAutoComplete {
    return !!(block as any).getAutoComplete;
  },
  isWithText(value?: any): value is { text: string } {
    if(!value || !value.text) return false;
    const text = value.text;
    return (typeof text) === 'string'
  },
} as const;