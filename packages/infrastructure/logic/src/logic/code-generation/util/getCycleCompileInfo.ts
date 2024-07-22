import { SchemeStore } from '@falang/editor-scheme';
import { checker } from '@falang/editor-scheme';
import { hasParentSwitchWithoutCycle } from './hasParentSwitchWithoutCycle';

export interface ICycleCompileInfoResult {
  hasBreaks: boolean
  hasContinues: boolean
  hasSwitchBreaks: boolean
}

export const getCycleCompileInfo = (scheme: SchemeStore): ICycleCompileInfoResult => {
  let hasBreaks = false;
  let hasContinues = false;
  let hasSwitchBreaks = false;
  scheme.icons.forEach((icon) => {
    if (!checker.isIconWithSkewer(icon)) return;
    const outStore = icon.skewer.outStore;
    if (!outStore) return;
    if (outStore.outLevel === 1) return;
    if (outStore.type === 'break') {
      hasBreaks = true;
      if(hasParentSwitchWithoutCycle({ icon: outStore, targetId: outStore.targetId })) {
        hasSwitchBreaks = true;
      }
    }
    if (outStore.type === 'continue') {
      hasContinues = true;
    }
  });
  return {
    hasBreaks,
    hasContinues,
    hasSwitchBreaks,
  }
};
