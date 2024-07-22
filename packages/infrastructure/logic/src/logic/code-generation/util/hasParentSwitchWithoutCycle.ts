import { IconStore } from '@falang/editor-scheme'

export interface IHasParentSwitchWithoutCycle {
  icon: IconStore,
  targetId: string,
}

/**
 * !!With cycle - its ok 
 */
export const hasParentSwitchWithoutCycle = ({ icon, targetId }: IHasParentSwitchWithoutCycle): boolean => {
  const parent = icon.parent;
  if (!parent) return false;
  if(parent.id === targetId) return false;
  if(parent.alias !== 'switch') return hasParentSwitchWithoutCycle({ icon: parent, targetId });
  return true;
}