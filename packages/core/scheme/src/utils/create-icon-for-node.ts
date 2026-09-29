import { checker } from '../checker.js';
import type { Scheme } from '../scheme/scheme.js';
import type { IconStore } from '../store/icon.store.js';
import type { NodeStore } from '../store/node.store.js';
import logger from './logger.js';

export const createIconForNode = (node: NodeStore, scheme: Scheme): IconStore => {
  const config = scheme.infra.iconsConfig[node.name];
  if (!config) throw new Error(`Config not found for icon: ${node.name}`);
  const factory = config.icon.factory;
  const nodeConfig = scheme.infra.structure.getConfig(node.name);
  if (!nodeConfig) throw new Error(`Node config not found: ${node.name}`);
  const icon = factory({
    config,
    dataNode: node,
    nodeConfig,
  });
  if (node.children.length > 0) {
    const childIcons = node.children.map((child) => createIconForNode(child, scheme));
    if (checker.isWithList(icon)) {
      icon.list.push(...childIcons);
    } else if (checker.isWithFixedChildren(icon)) {
      icon.setChildren(childIcons);
    } else {
      logger.warn(`Node ${node.id} have children, but icon have no children or list`);
    }
    childIcons.forEach((child) => child.setParent(icon));
  }
  if (node.mods.length > 0) {
    const modIcons = node.mods.map((mod) => createIconForNode(mod, scheme));
    icon.mods.replace(modIcons);
    modIcons.forEach((mod) => mod.setParent(icon));
  }
  if (node.out && checker.isWithSkewer(icon)) {
    const outIcon = createIconForNode(node.out, scheme);
    if (!checker.isOut(outIcon)) {
      throw new Error(`Icon ${node.name} should be out icon`);
    }
    icon.skewer.setOutStore(outIcon);
  }
  scheme.icons.add(icon);
  icon.resetShape();
  return icon;
};
