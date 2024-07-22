import { checker } from '@falang/editor-scheme';
import { BlockStore } from '@falang/editor-scheme';
import { IconStore } from '@falang/editor-scheme';
import { LogicBaseBlockStore } from '../blocks/logic-base/LogicBaseBlock.store';
import { TContext } from '../constants';

export const getContextForIcon = (icon: IconStore): TContext => {
  const scheme = icon.scheme;
  const parent = icon.parent;
  if (!parent) return {};
  if (!checker.isIconWithList(parent)) return getContextForIcon(parent);
  const iconsIds = parent.list.iconsIds;
  const index = iconsIds.indexOf(icon.id);
  if (index <= 0) {
    return exportContextFromIcon(parent, true);
  } else {
    const prevId = iconsIds[index - 1];
    const prevIcon = scheme.icons.getSafe(prevId);
    if (!prevIcon) return {};
    return exportContextFromIcon(prevIcon);
  }
}

export const exportContextFromIcon = (icon: IconStore, useScope = false): TContext => {
  const block = icon.block;
  if (!(block instanceof LogicBaseBlockStore)) {
    const parent = icon.parent;
    if (!parent) return {};
    return getContextForIcon(icon);
  }
  return {
    ...block.context,
    ...block.exportedVariables,
    ...(useScope ? block.scopeVariables : {}),
  }
}
