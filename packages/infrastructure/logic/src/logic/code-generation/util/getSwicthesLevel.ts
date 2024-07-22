import { checker } from '@falang/editor-scheme';
import { IconStore } from '@falang/editor-scheme'

export interface IGetSwitchesLevelParams {
  icon: IconStore,
  targetId: string,
}

export const getSwitchesLevel = ({ icon, targetId }: IGetSwitchesLevelParams): number => {
  const parent = icon.parent;
  if (!parent) return 0;
  if (parent.id === targetId) return 0;
  if (checker.isCycle(parent)) return 0;
  if (parent.alias !== 'switch') return getSwitchesLevel({ icon: parent, targetId });
  return 1 + getSwitchesLevel({ icon: parent, targetId });
}