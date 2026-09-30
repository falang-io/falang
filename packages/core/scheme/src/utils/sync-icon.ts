import { checker } from '../checker.js';
import type { Scheme } from '../scheme/scheme.js';
import type { IconWithSkewerStore } from '../skewer/icon-with-skewer.store.js';
import type { IconStore } from '../store/icon.store.js';
import type { NodeStore } from '../store/node.store.js';
import type { IIconWithList } from '../types/icon-list.js';
import { createIconForNode } from './create-icon-for-node.js';

const isChangedIds = (ids1: string[], ids2: string[]): boolean => {
  if (ids1.length !== ids2.length) return true;
  for (let i = 0; i < ids1.length; i += 1) {
    if (ids1[i] !== ids2[i]) return true;
  }
  return false;
};

const removeDescendantIcons = (node: NodeStore, scheme: Scheme): void => {
  node.children.forEach((child) => {
    removeDescendantIcons(child, scheme);
    const childIcon = scheme.icons.getIconSafe(child.id);
    if (childIcon) {
      childIcon.dispose();
      scheme.icons.delete(child.id);
    }
  });
  if (node.out) {
    const outIcon = scheme.icons.getIconSafe(node.out.id);
    if (outIcon) {
      outIcon.dispose();
      scheme.icons.delete(node.out.id);
    }
  }
};

/** Whether `node` lies strictly inside an icon that hides its descendants (`IconFlags.HidesChildren`) — it has no icon and neither do its parents up to that one. */
const isInsideHiddenIcon = (node: NodeStore, scheme: Scheme): boolean => {
  let current = node.parent;
  while (current) {
    if (checker.hidesChildren(scheme.icons.getIconSafe(current.id))) return true;
    current = current.parent;
  }
  return false;
};

const updateList = (node: NodeStore, icon: IIconWithList, scheme: Scheme): void => {
  const currentIds = icon.list.iconsIds;
  const newIds = node.children.map((n) => n.id);
  if (!isChangedIds(currentIds, newIds)) return;
  const toCreate = newIds.filter((newId) => !currentIds.includes(newId));
  const toDelete = currentIds.filter((curId) => !newIds.includes(curId));
  for (const toCreateId of toCreate) {
    const existsIcon = scheme.icons.getIconSafe(toCreateId);
    if (!existsIcon) {
      createIconForNode(scheme.nodes.getNode(toCreateId), scheme);
    }
  }
  for (const toDeleteId of toDelete) {
    const deletedNode = scheme.nodes.getNodeSafe(toDeleteId);
    if (deletedNode) {
      const toDeleteIcon = scheme.icons.getIcon(toDeleteId);
      toDeleteIcon.dispose();
      scheme.icons.delete(toDeleteIcon.id);
      // A node moved into an icon that hides its children keeps no icons at all: drop the whole subtree's.
      removeDescendantIcons(deletedNode, scheme);
    }
  }
  const newIcons = newIds.map((newId) => scheme.icons.getIcon(newId));
  icon.list.replace(newIcons);
  newIcons.forEach((newIcon) => newIcon.setParent(icon));
  icon.resetShape();
};

const createIcon = (node: NodeStore, scheme: Scheme) => {
  if (!node.parent) {
    createIconForNode(node, scheme);
    return;
  }
  const index = node.parent.children.findIndex((n) => n.id === node.id);
  if (index === -1) throw new Error(`Not found index for node ${node.id}`);
  const iconToInsert = createIconForNode(node, scheme);
  const parentIcon = scheme.icons.getIcon(node.parent.id);
  if (!checker.isWithList(parentIcon)) throw new Error(`Icon ${parentIcon.id} should be list`);
  parentIcon.list.splice(index, 0, [iconToInsert]);
  iconToInsert.setParent(parentIcon);
  parentIcon.resetShape();
};

const syncOut = (node: NodeStore, icon: IconWithSkewerStore, scheme: Scheme): void => {
  const oldId = icon.skewer.out?.id ?? null;
  const newId = node.out?.id ?? null;
  if (oldId === newId) return;
  if (oldId) {
    const oldIcon = scheme.icons.getIcon(oldId);
    oldIcon.dispose();
    scheme.icons.delete(oldId);
    icon.skewer.out = null;
  }
  if (node.out) {
    const newOutIcon = createIconForNode(node.out, scheme);
    if (!checker.isOut(newOutIcon)) {
      throw new Error(`Icon ${node.name} should be out icon`);
    }
    icon.skewer.setOutStore(newOutIcon);
    newOutIcon.resetShape();
  }
};

const syncMods = (node: NodeStore, icon: IconStore, scheme: Scheme): void => {
  const currentIds = icon.mods.map((mod) => mod.id);
  const newIds = node.mods.map((n) => n.id);
  if (!isChangedIds(currentIds, newIds)) return;
  const toCreate = newIds.filter((newId) => !currentIds.includes(newId));
  const toDelete = currentIds.filter((curId) => !newIds.includes(curId));
  for (const toCreateId of toCreate) {
    const existsIcon = scheme.icons.getIconSafe(toCreateId);
    if (!existsIcon) {
      createIconForNode(scheme.nodes.getNode(toCreateId), scheme);
    }
  }
  for (const toDeleteId of toDelete) {
    const toDeleteIcon = scheme.icons.getIconSafe(toDeleteId);
    if (toDeleteIcon) {
      scheme.icons.delete(toDeleteIcon.id);
      toDeleteIcon.dispose();
    }
  }
  const newIcons = newIds.map((newId) => scheme.icons.getIcon(newId));
  icon.mods.replace(newIcons);
  newIcons.forEach((newIcon) => newIcon.setParent(icon));
  icon.resetShape();
};

export const syncIcon = (id: string, scheme: Scheme): void => {
  const node = scheme.nodes.getNode(id);
  // Everything below a hiding icon (e.g. inside a `magic` node) has no icons to keep in sync.
  if (isInsideHiddenIcon(node, scheme)) return;
  const icon = scheme.icons.getIconSafe(id);
  if (!icon) {
    createIcon(node, scheme);
    return;
  }
  if (checker.isWithList(icon)) {
    updateList(node, icon, scheme);
  }
  syncMods(node, icon, scheme);
  if (checker.isWithSkewer(icon)) {
    syncOut(node, icon, scheme);
  }
};
